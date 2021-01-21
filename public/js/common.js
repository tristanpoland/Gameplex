//The build will inline common dependencies into this file.

//For any third party dependencies, like jQuery, place them in the lib folder.

//Configure loading modules from the lib directory,
//except for 'app' ones, which are in a sibling
//directory.
requirejs.config({
    baseUrl: '/js/lib',
    paths: {
      app: '../app',
      jquery: 'jquery.min',
      bootstrap: 'bootstrap.min',
      mustache: 'mustache.min',
      io: '/socket.io/socket.io',
      showdown : 'https://cdn.rawgit.com/showdownjs/showdown/1.6.4/dist/showdown.min'
    },
    shim: {
        "bootstrap": {
          deps: ["jquery"]
        }
    },
});