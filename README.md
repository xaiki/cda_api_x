CDA API
========
Web scraper for cda.gob.ar

Currently supports 3 methods

`getAllShows(cb)` Returns an object array of all Shows on cda.gob.ar in the
form `{show: showname, id: cdaid, img: showimage, episodes: [episodes array], category: category}`

`getEpisodeMagnet(data, cb)` Data is a JSON object in the format `{show: 'Community', season: 5, episode: 12}`. Returns the magnet link as a string.

`getAllEpisodes(data, cb)` Data is JSON object same as one returned in `getAllShows` returns multi-dimensional array with magnet URL string in the form `episodes[season][episode]`

`cb` is the callback function passed to the methods and will be of the form `function cb(error, result)`
