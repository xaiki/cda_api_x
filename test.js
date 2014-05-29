var _ = require('underscore');

var cda = require('./cda_api');

var shows = cda.getAllShows(function (err, data) {
    console.log(data);
    var show = _.findWhere (data, {'id': '1346'});

    console.log ('-->', show);
    var episodes = cda.getAllEpisodes(show, function(err, data) {
        if(err) return console.error(err);
        console.log(data);
    })
});


