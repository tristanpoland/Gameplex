define(function(require) {
  var $ = require("jquery");
  var _bootstrap = require("bootstrap");
  var gofish = require("./gofish");
  var Mustache = require("mustache");
  
  $(function() {
    $.getJSON("/deck.json", function(data) {
      var deck = new gofish.CardDeck(data);
      var cardspec = document.location.hash.slice(1).split('/').map(decodeURIComponent),
          rank, suit, card ;
      console.log(cardspec);
      if (cardspec.length==2) {
        try {
          card = deck.getCard(cardspec[0],cardspec[1]);          
        } catch(e) { }
      }
      if (!card) {
        document.location.hash='';
        card = deck.cards[Math.floor(Math.random()*deck.cards.length)];
      }
      $('#header').html(Mustache.render($('#header-template').html(), card));
      $('#card').html(Mustache.render($('#card-template').html(), card));
    });
  });
});
