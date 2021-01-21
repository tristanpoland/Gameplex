define(function(require) {
  var $ = require("jquery");
  var io = require("io");
  var _bootstrap = require("bootstrap");
  var gofish = require("./gofish");
  var Mustache = require("mustache");
  var urlize = require('urlize');
  var Push = require('push');
  var Clipboard = require('clipboard');
  var beep = new Audio('https://cdn.glitch.com/ccb30db3-78cd-46da-af4b-a75cabfc5233%2FSONAR.wav?1497644439627');
  
  $(function() {
    var FADE_TIME = 150;
    var TYPING_TIMER_LENGTH = 400;
    var COLORS = [ 
      "#58dc00", "#287b00", "#a8f07a", "#4ae8c4",
      "#3b88eb", "#3824aa", "#a700ff", "#d300e7",
      "#e21400", "#91580f", "#f8a700", "#f78b00"
    ];
    var $window = $(window);
    var $usernameInput = $(".usernameInput");
    var $messagesDiv = $("#messages-div");
    var $cardsDropdown = $("#cards-dropdown");
    var $ranksDropdown = $("#ranks-dropdown");
    var $deckDropdown = $("#deck-dropdown");
    var $cardModals = $("#card-modals");
    var $rankModals = $("#rank-modals");
    var $messages = $(".messages");
    var $inputMessage = $(".inputMessage");
    var $loginModal = $("#login-modal");
    var $chatPage = $("#chat-page");
    var $userList = $("#user-list");
    var $handRow = $("#hand-row");
    var cardDropdownTemplate = $("#card-dropdown-template").html();
    var rankDropdownTemplate = $("#rank-dropdown-template").html();
    var cardModalTemplate = $("#card-modal-template").html();
    var rankModalTemplate = $("#rank-modal-template").html();
    var userTemplate = $("#user-template").html();
    var handRowTemplate = $("#hand-row-template").html();
    var playBarTemplate = $("#play-bar-template").html();
    var GameOvTemplate = $("#play-bar-template").html();
    var scoreTemplate = $("#score-template").html();    
    [
      cardDropdownTemplate, rankDropdownTemplate,
      cardModalTemplate, rankModalTemplate,
      userTemplate, playBarTemplate,
      GameOvTemplate, scoreTemplate
    ].forEach(function(t) {
      Mustache.parse(t); // optimizes rendering
    })
    var username = "";
    var users = [];
    var free_ranks = [];
    var usermap = {};
    var turn = null;
    var $usermap = {};
    var typingmap = {};
    var connected = false;
    var typing = false;
    var lastTypingTime;
    var $currentInput = $usernameInput.focus();
    var socket = io();
    
    $(window).on('beforeunload', function() {
      if (connected && (socket.hand.cards.length || socket.ranks.length)) {
        return true;
      };
    });
    var clipboard = new Clipboard('.copy-btn');
    $('#mute-button').on('click', function() {
      pushNotify(`Audio notifications ${$('#mute-button').hasClass('active')?
                 'on' : 'off'}`, true); // inverse logic (wasn't toggled yet)
      $('#mute-icon').toggleClass('glyphicon-volume-off').toggleClass('glyphicon-volume-up');
    });

    $.getJSON("/deck.json", function(data) {
      socket.deck = new gofish.CardDeck(data);
    });
    
    function pushNotify(msg, inverse_logic) {
      // inverse_logic is true when we pushNotify from mute button's
      // "click" handler, because button state only gets toggled later
      Push.create("Go Fish", {
        body: msg,
        icon: 'https://cdn.glitch.com/ccb30db3-78cd-46da-af4b-a75cabfc5233%2Fgo-fish-color.png?1493755260516',
        timeout: 23000,
        vibrate: [200, 100, 50, 25],
        onClick: function () {
            window.focus();
            this.close()
        }
      });
      if (!!$('#mute-button').hasClass('active') === !!inverse_logic) { // !! coerces bool 👌
        // Audio data: https://gist.github.com/xem/670dec8e70815842eb95
        // var snd = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'+
        //                     Array(1e3).join(123));  
        // snd.play();
        beep.play();
      }
    }    
    function updateGame(data) {
      if (data) {
        users = data.game.users;
        usermap = {};
        users.forEach(function(u) { usermap[u.name] = u; });
        turn = data.game.turn;
        $('#pile-size').text(data.game.pile_size);
      }
      
      $('#username-brand').html(username+'&nbsp;');

      $("#bottom-bar").removeClass('nav-inverse');
      $("#play-bar").empty();
      if (turn===null) {
        $('#game-status').html(
          'No one to play with <button type="button" class="btn btn-success btn-xs" data-toggle="modal" data-target="#invite-modal">'+
          '👋Invite friends</button>');
      }
      if (turn!==null) {
        $('#game-status').html(turn+"'s turn");
        if (turn===username) { // our turn
          var rankmap = {};
          socket.deck.ranks.forEach(function(r) {
            rankmap[r.name] = r;
          });
          users.forEach(function(u) {
            u.ranks.forEach(function(rank) {
              delete rankmap[rank.name];
            });
          });
          
          var free_ranks = socket.deck.ranks.filter(function (r) {            
            return r.name in rankmap;
          });

          $('#game-status').html("<strong>your</strong> turn");
          $('#username-brand').append(
            $('<span class="glyphicon glyphicon-hand-right" aria-hidden="true"></span>'));
          $("#play-bar").html(
            Mustache.render(
              playBarTemplate, {
                who: users.filter(function(u) {
                  return u.hand_size>0 && u.name!==username; }),
                ranks: free_ranks,
                suits: socket.deck.suits
              }
            )
          );
          $('.drop-select').click(function() {
            $($(this).data('target'))
                .text($(this).data('value'))
                .data('done', true);
             $('#ask-button').prop(
               'disabled',
               !($('#play-with-field').data('done') &&
                 $('#play-rank-field').data('done') &&
                 $('#play-suit-field').data('done')));
          });
          $('#ask-button').click(function() {
            socket.emit(
              "ask", {
                from: $('#play-with-field').text(),
                rank: $('#play-rank-field').text(),
                suit: $('#play-suit-field').text()
            });            
            $(this).prop('disabled',true);
            // give phones feedback that something
            // happened (menu might hide entire display)
            $('.collapse').collapse('hide');
            log(Mustache.render(
              "You ask {{{u}}} for {{r}} of {{s}}...", {
                u: $('#play-with-field').text(),
                r: $('#play-rank-field').text(),
                s: $('#play-suit-field').text()
            }));
          });
        }
      }
      $usermap = {};
      users.forEach(function(user) {
        $usermap[user.name] = $("<li/>")
          .addClass("list-group-item");
        updateUser(user);
      });
      $userList.empty();
      users.forEach(function(user) {
        $userList.append($usermap[user.name]);
      });
      $handRow.html(Mustache.render(
        handRowTemplate, {cards: socket.hand.cards }
      ));      
    }
    
    function updateUser(user) {
      var $user = $usermap[user.name];
      if (!$user) {
        return;
      }
      $user.html(Mustache.render(userTemplate, {
        user: user,
        typing: typingmap[user.name],
        playing: turn!==null && turn===user.name,
        me: user.name === username
      }));
    }
    function updateHand(socket) {
      $cardsDropdown.empty();
      if (socket.hand.cards.length) {
        $cardsDropdown.append(
          $(Mustache.render(cardDropdownTemplate, {cards: socket.hand.cards})));
      }
      $('.rank-modal').modal('hide');
      $('.modal-backdrop').remove(); // tweak around sloppy modal disposal :s
      $ranksDropdown.empty();
      var user = usermap[socket.username];
      if (user && user.ranks.length) {
        $ranksDropdown.append(
          $(Mustache.render(rankDropdownTemplate, {ranks: user.ranks})));
      };
      $deckDropdown.html(
        $(Mustache.render(rankDropdownTemplate, {
          ranks: socket.hand.deck.ranks,
          is_deck: true
        }))
      );
      $('.card-modal').modal('hide');
      $('.modal-backdrop').remove(); // tweak around sloppy modal disposal :s
      $cardModals.empty();
      socket.hand.cards.forEach(function(card) {
        $cardModals.append(
          $(Mustache.render(cardModalTemplate, card)));
      });
      
      $rankModals.empty();
      var theranks = socket.hand.deck.ranks;
      theranks.forEach(function(rank) {
        $rankModals.append(
          $(Mustache.render(rankModalTemplate, rank)));
      });
      updateGame();
    }
    function setUsername() {
      username = $usernameInput.val().trim().toLowerCase();
      if (username) {
        $loginModal.modal("hide");
        $currentInput = $inputMessage.removeAttr("disabled").val("").attr("placeholder", "chat here...");
        socket.emit("join", username);
      }
    }
    function sendMessage() {
      var message = $inputMessage.val().trim();
      if (message && connected) {
        $inputMessage.val("");
        addChatMessage(
          { username: username, message: message },
          { sanitize: false } // no need. we sanitize server side now
        );
        socket.emit("new message", message);
      }
    }
    function log(message, options) {
      var $el = $("<li>").addClass("log").html(message);
      addMessageElement($el, options);
    }
    function addChatMessage(data, options) {
      var $username = $('<span class="username"/>').html(data.username).css("color", getUsernameColor(data.username));
      var $messageBody = $("<span/>").addClass("messaegBody");
      if (options && options.sanitize) {
        $messageBody.text(data.message); // obsolete, actually...
      } else {
        $messageBody.html(urlize(data.message, {target: "_blank"}));
      }
      var typingClass = data.typing ? "typing" : "";
      var $message = $('<li class="message"/>').data("username", data.username)
        .addClass(typingClass).append($username, $messageBody);
      addMessageElement($message, options);
    }
    function addChatTyping(data) {
      typingmap[data.username] = true;
      updateUser(data.username);
    }
    function removeChatTyping(data) {
      delete typingmap[data.username];
      updateUser(data.username);
    }
    function addMessageElement(el, options) {
      var $el = $(el);
      if (!options) {
        options = {};
      }
      if (typeof options.fade === "undefined") {
        options.fade = true;
      }
      if (typeof options.prepend === "undefined") {
        options.prepend = false;
      }
      if (options.fade) {
        $el.hide().fadeIn(FADE_TIME);
      }
      if (options.prepend) {
        $messages.prepend($el);
      } else {
        $messages.append($el);
      }
      $messagesDiv.animate({
        scrollTop: $messagesDiv.prop("scrollHeight") - $messagesDiv.height()
      }, 500);
    }
    function updateTyping() {
      if (connected) {
        if (!typing) {
          typing = true;
          socket.emit("typing");
        }
        lastTypingTime = new Date().getTime();
        setTimeout(function() {
          var typingTimer = new Date().getTime();
          var timeDiff = typingTimer - lastTypingTime;
          if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
            socket.emit("stop typing");
            typing = false;
          }
        }, TYPING_TIMER_LENGTH);
      }
    }
    function getUsernameColor(username) {
      var hash = 7;
      for (var i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + (hash << 5) - hash;
      }
      var index = Math.abs(hash % COLORS.length);
      return COLORS[index];
    }
    $window.keydown(function(event) {
      if (!(event.ctrlKey || event.metaKey || event.altKey)) {
        $currentInput.focus();
      }
      if (event.which === 13) {
        if (username) {
          sendMessage();
          socket.emit("stop typing");
          typing = false;
        } else {
          setUsername();
        }
      }
    });
    $inputMessage.on("input", function() {
      updateTyping();
    });
    $loginModal.click(function() {
      $currentInput.focus().select();
    });
    $('#messages-div').click(function() {
      $inputMessage.focus();
    });
    socket.on("connect", function() {
      // nothing so far
    });
    socket.on("disconnect", function() {
      connected = false;
      pushNotify('disconnected 😟');
      alert('disconnected 😟');
      document.location.reload();
    });

    socket.on("joined", function(data) {
      socket.username = data.username;
      socket.hand = new gofish.CardHand(socket.deck);
      connected = true;
      var message = "Welcome, "+data.username;
      log(message, {
        prepend: true
      });
      updateGame(data);
    });
    socket.on("username taken", function(data) {
      username = "";
      $currentInput = $usernameInput.focus().val("")
        .attr("placeholder",
              "Sorry, " + data.username + " is taken.");
      $loginModal.modal("show");
    });
    socket.on("new message", function(data) {
      addChatMessage(data);
      if (data.username!==socket.username) {
                pushNotify(data.username+': "'+data.message+'"');
      }
    });
    socket.on("status", function(data) {
      log(data.message);
      updateGame(data);
      if (data.announce_turn && data.game.turn===socket.username) {
        pushNotify("Your turn");
      }
    });
    socket.on("game over", function(data) {
      socket.hand.clear();
      updateGame(data);
      var score_html = Mustache.render(
        scoreTemplate, data);
      log('Game over. Refresh browser to play again.');
      log(score_html);
      pushNotify('Game over.');
      $('#score').html(score_html);
      $('#game-over-modal').modal('show');
    });
    socket.on("take", function(data) {
      var card = socket.hand.deck.getCard(
        data.rank, data.suit);
      if (!card) {
        console.log("can't take card: "+JSON.stringify(data));
        return;
      }
      socket.hand.take(card);
      var pr=socket.hand.pull_rank();
      if (pr) {
        // ugly patch to update menu before next status
        usermap[socket.username].ranks.push(pr);
      }
      updateHand(socket);
    });
    socket.on("give", function(data) {
      var index = socket.hand.cards.findIndex(function(c) {
        return c.rank==data.rank && c.suit==data.suit;
      });
      if (index<0) {
        console.log("can't give card: "+JSON.stringify(data));
        return;
      }
      socket.hand.cards.splice(index,1);
      updateHand(socket);
    });
    
    socket.on("user joined", function(data) {
      updateGame(data);
      log(data.username + " joins");
      pushNotify(data.username + " joins");
    });
    socket.on("user left", function(data) {
      updateGame(data);
      log(data.username + " leaves");
      pushNotify(data.username + " leaves");
    });
    socket.on("typing", function(data) {
      addChatTyping(data);
    });
    socket.on("stop typing", function(data) {
      removeChatTyping(data);
    });
    $loginModal.on("hidden.bs.modal", function(e) {
      if (!username) $loginModal.modal("show");
    });
    $loginModal.modal("show");
  });
});