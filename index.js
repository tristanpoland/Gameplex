var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);
var sanitizeHtml = require('sanitize-html');

var requirejs = require("requirejs");
requirejs.config({
  baseUrl: "public/js/lib",
  paths: {
    app: "../app",
    mustache: "mustache.min"
  },
  nodeRequire: require
});

requirejs([ "mustache", "app/gofish" ],
          function(Mustache, gofish) {
  var port = process.env.PORT || 3000;
  var deck = new gofish.CardDeck(require(__dirname + "/public/deck.json"));
  var num_suits = deck.suits.length;
  var pile = new gofish.CardHand(deck, true);
  pile.shuffle();
  var game = {
    pile_size: pile.cards.length,
    turn: null, // it's users[turn]'s turn (unless null)
    users: [],
  };
  var usermap = {};
  var socketmap = {};
  var turn_timer = null;
  
  
  
  io.on("connection", function(socket) {
    socket.joined = false;
    socket.hand = new gofish.CardHand(deck);

    // we don't define these game helpers as methods of game,
    // so that we can emit/serialize it.
    socket.update_game = function() {
      game.pile_size = pile.cards.length;
      game.users.forEach(function(u) {
        var s = socketmap[u.name];
        if (s) {
          u.hand_size = s.hand.cards.length;
        } else {
          u.hand_size = 0;
          console.log('lost socket for '+JSON.stringify(u));
        }
      });
    };
    socket.set_turn_timer = function() {
      if (turn_timer) {
        clearTimeout(turn_timer);
      };
      turn_timer = setTimeout(function() {
        var turn = game.turn;
        if (turn) {
          var message = Mustache.render(
            "We can't wait forever for {{{turn}}} to make a move.",
            {turn: turn});
          socket.emit("status", { message: message, game: game });
          socket.broadcast.emit("status", { message: message, game: game });
          socket.next_turn();
        }
      },120000);
    }
    socket.next_turn = function() {
      var players = game.users.filter(function(u) {
        return u.hand_size>0;
      });
      if (players.length<=1) {
          game.turn = null; // it takes two to go fish
      } else {
        if (game.turn===null) {
          game.turn = players[0].name;
        } else {
          var current = players.findIndex(function(u) {
            return u.name===game.turn;
          });
          game.turn = players[
            current>=0? (current+1)%players.length: 0
          ].name;
        }
        var message = game.turn+"'s turn";
        socket.emit(
          "status", { message: message, game: game, announce_turn: true });
        socket.broadcast.emit(
          "status", { message: message, game: game, announce_turn: true });
        socket.set_turn_timer();
      }
    };
    socket.check_bust = function(sock) {
      if (!sock.hand.cards.length) {
        var was_playing = game.turn!==null;
        sock.next_turn();
        sock.update_game();
        sock.emit("status", {
          message: "You're out of cards.",
          game: game
        });
        sock.broadcast.emit("status", {
          message: Mustache.render(
            "{{{u}}} is out of cards.",
            { u: sock.username }), // TODO list owned ranks
          game: game
        });
        if (was_playing && game.turn===null) { // game over
          var scores = game.users.map(function (u) {
            return {
              name: u.name,
              ranks: u.ranks,
              hand_size: u.hand_size,
              single_card: u.hand_size===1,
              score: 2*deck.suits.length*u.ranks.length - u.hand_size
            };
          });
          if (scores) {
            scores.sort(function(a,b) { return b.score - a.score; });
          }
          pile = new gofish.CardHand(deck, true);
          for (var u in socketmap) {
            socketmap[u].hand.clear();
            socketmap[u].user.ranks = [];
          };
          sock.update_game();
          
          sock.emit('game over', {scores: scores, game: game});
          sock.broadcast.emit('game over', {scores: scores, game: game});
        }
      }
    };

    socket.on("join", function(username) {
      if (socket.joined) return;
      username = sanitizeHtml(username.trim().toLowerCase(), {allowedTags:[]});
      if (!username) return;
      if (usermap[username]) {
        socket.emit(
          "username taken", { username: username });
        return;
      }

      socket.username = username;
      socketmap[username] = socket;
      socket.hand = new gofish.CardHand(deck);
      socket.user = {
        name: username,
        hand_size: socket.hand.cards.length,
        ranks: []
      };
      usermap[username] = socket.user;
      game.users.push(socket.user);
      socket.joined = true;
      socket.emit("joined", {
        username: username,
        game: game
      });
      socket.broadcast.emit("user joined", {
        username: username,
        game: game
      });
      console.log(username+" joins");
      if (pile.cards.length>=num_suits) {
        deck.suits.forEach(function(ignored) {
          var card = pile.give();
          socket.hand.take(card);
          socket.emit("take", {
            rank: card.rank,
            suit: card.suit
          })
        });
        // make sure we weren't dealt a full rank
        var pr = socket.hand.pull_rank();
        if (pr) {
          var trade_in = pr.cards.pop();
          pr.cards.forEach(function(c) {
            socket.hand.take(c);
          });
          socket.hand.take(pile.give());
          pile.take(trade_in);
          pile.shuffle();
        }
        socket.update_game();
        socket.user.hand_size = socket.hand.cards.length;
        socket.emit("status", {
          message: Mustache.render(
            "You draw {{n}} cards",
            {n: num_suits}),
          game: game
        });
        socket.broadcast.emit("status", {
          message: Mustache.render(
            "{{{user}}} draws {{n}} cards",
            {user: socket.username, n: num_suits}),
          game: game
        });
        if (game.users.length>1 && game.turn===null) {
          // game can start
          socket.next_turn();
        };
      } else {
        socket.emit("status", {
          message: "Not enough cards in the pile for you &#128542;",
          game: game          
        });
        socket.broadcast.emit("status", {
          message: Mustache.render(
            "Not enough cards in the pile for {{user}} &#128542;",
            {user: socket.username}),
          game: game          
        });
      }
    });
    socket.on("new message", function(data) {
      data = sanitizeHtml(data, {allowedTags:[]});
      socket.broadcast.emit("new message", {
        username: socket.username,
        message: data
      });
    });
    socket.on("typing", function() {
      socket.broadcast.emit("typing", {
        username: socket.username
      });
    });
    socket.on("stop typing", function() {
      socket.broadcast.emit("stop typing", {
        username: socket.username
      });
    });
    socket.on("ask", function(data) {
      if (game.turn===socket.username) {
        if (turn_timer) {
          clearTimeout(turn_timer);
        }
        var fromsock = socketmap[data.from];
        if (fromsock) {
          socket.broadcast.emit("status", {
            message: Mustache.render(
              "{{u}} asks {{data.from}} for {{data.rank}} of {{data.suit}}...",
              {u:socket.username, data:data}
            ),
            game: game
          });
          var card = fromsock.hand.ask(data.rank, data.suit, true);
          if (card) {
            socket.hand.take(card);
            socket.hand.sort();
            fromsock.emit("give", {
              rank: card.rank, suit: card.suit,
              to: socket.username
            });
            socket.emit("take", {
              rank: card.rank, suit: card.suit,
              from: data.from
            });
            var pr = socket.hand.pull_rank();
            if (pr) {
              socket.user.ranks.push(pr);
            }
            socket.update_game();
            var message = Mustache.render(
              "{{to}} takes {{card.rank}} of {{card.suit}} from {{from}}"+
              "{{#pr}}, pulling the {{{symbol}}} {{name}} rank &#9996;{{/pr}}",
              {
                from: fromsock.username, to: socket.username,
                card: card, pr: pr
            });
            socket.emit(
              "status", { message: message, game: game });
            socket.broadcast.emit(
              "status", { message: message, game: game });
            socket.check_bust(fromsock);
            if (pr) {
              socket.check_bust(socket);
            }
            if (game.turn===socket.username) {
              socket.set_turn_timer();
              socket.emit(
                "status", { message: "You get another turn &#9996;", game: game });
            }
          } else {
            // Go fish
            card = pile.give();
            if (card) {
              socket.hand.take(card);
              var pr = socket.hand.pull_rank();
              if (pr) {
                socket.user.ranks.push(pr);
              }
              socket.update_game();
              socket.emit(
                "take", {rank: card.rank, suit:card.suit});
              socket.emit(
                "status", {
                  message: Mustache.render(
                    "You go fish {{rank}} of {{suit}}", card),
                  game: game });
              socket.broadcast.emit(
                "status", { message: "Go fish", game: game });
              
              if (pr) {
                var message = Mustache.render(
                  "Lucky fishing trip. {{user}}"+
                  "{{#pr}} pulls the {{{symbol}}} {{name}} rank &#9996;{{/pr}}",
                  { user: socket.username, card: card, pr: pr });
                socket.emit(
                  "status", { message: message, game: game, pr: pr });
                socket.broadcast.emit(
                  "status", { message: message, game: game, pr: pr });
                socket.check_bust(socket);
              }
            } else {
              socket.emit(
                "status", { message: "Can't go fish &#128542;", game: game });  
              socket.broadcast.emit(
                "status", { message: "Can't go fish &#128542;", game: game });  
            };
            socket.next_turn();
          }
        } else {
          // Should never happen
          socket.emit(
            "status", {
            message: "couldn't find user "+data.from,
            game: game
          });
        }
      } else { // not user's turn. Ignore.
        console.log("username "+socket.username+" is cheating!?! turn='"+
                    game.turn+"'");
      }
    });
    socket.on("disconnect", function() {
      if (socket.joined) {
        console.log(socket.username+" leaves");
        var i = game.users.indexOf(socket.user);
        if (i >= 0) {
          game.users.splice(i, 1);
          if (socket.username===game.turn || // current player leaves
              game.users.filter(
                function(u) { return u.hand_size>0 }).length===1) {
            socket.next_turn();
          }
        }
        i = game.users.indexOf(socket.user);
        if (i>=0) {
          game.users.splice(i, 1);
        }
        socket.hand.cards.forEach(function(card) {
          pile.take(card);
        });
        socket.user.ranks.forEach(function(r) {
          r.cards.forEach(function(card) {
            pile.take(card);
          });
        });
        pile.shuffle();
        if (usermap[socket.username]) {
          delete usermap[socket.username];
        } else {
          console.log(
            "Found no usermap entry when "+socket.username+" was leaving");
        }

        if (socketmap[socket.username]) {
          delete socketmap[socket.username];
        } else {
          console.log(
            "Found no socket when "+socket.username+" was leaving");
        }
        socket.update_game();
                    
        socket.broadcast.emit("user left", {
          username: socket.username,
          game: game
        });
      }
    });
  });
  
  server.listen(port, function() {
    console.log(
      "Server listening at port "+port
    );
  });
                
                

  app.use(express.static("public"));

})();