/*************************
**  Modules     **
**************************/

var _       =   require('underscore');
var Q       =   require('q');
var request =   require('request');
var cheerio =   require('cheerio');
var moment  =   require('moment');

/*************************
**  Variables   **
**************************/

var BASE_URL    =   "http://cda.gob.ar";
var CATEGORIES  = ['micros'];// ['series-unitarios', 'documentales', 'micros', 'igualdad-cultural']; //

if(typeof(String.prototype.trim) === "undefined")
{
    String.prototype.trim = function()
    {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

var pages = {};
/* XXX(xaiki): HACK
 *
 * this is done as a global because passing deferred around * seems to break
 * them for some reason */
var deferred = {}; 

function getAllPages (cat, start) {
    if (! pages[cat])
        pages[cat] = {};

    var promise = getPagedCategory(cat, start);
    promise.then (function (o) {
        pages[cat][start] = o;
        getAllPages(cat, start + 1)
    }, function (o) {
        return deferred[cat].resolve(_.flatten(pages[cat]));
    });
}

function getShowInfo (url, cat, img) {
    var d     = Q.defer();

    var slug  = url.split('/').pop();
    //console.log ('info', BASE_URL + url);
    request(BASE_URL + url, function (err, res, html) {
        if (err) {
            console.log (url, err);
            return d.reject (new Error(err));
        }

        var id = html.match(/clip_id = (\d+)/m)[1];

        var $ = cheerio.load(html);
        var title = $('h1#title').text().trim();
        var entry = $('#video-content').find('.container');

        var episodes = [];
        $('ul.chapters').find('li').each(function (i, el) {
            var cid = $(el).attr('id').trim().split('_')[1];
            episodes.push({id: cid});

        });

        var ret = {show: title, id: id, img: img, episodes: episodes, category: cat, slug: slug};
        var hack = entry.html().replace(/<\/?span>/g, '');
        _.map(hack.match(/<h[34]>([^<]+)<\/h[34]>[\n ]*<p>([^<]+)<\/p>/mg), function (r) {
            var a = r.match(/<h[34]>([^<:]+)(?::\s+)?<\/h[34]>[\n ]*<p>\s*([^<]+)\s*<\/p>/m).slice(1, 3);
            var key = a[0].toLowerCase();
            if (key === "actores")
                a[1] = a[1].split(/,\s*/)
            ret[key] = a[1];
        });

        return d.resolve(ret);
    });
    return d.promise;
}

function getPagedCategory (cat, page) {
    var deferred = Q.defer();
    var url = BASE_URL + '/' +  cat + '/?page=' + page;

    console.log (url);
    request(url, function(err, res, html){
        if(err) {
            console.log ('error', err);
            return deferred.reject (new Error(err));
        }

        var $ = cheerio.load(html);
        var title, show;

        if ($('article').length == 0) {
            return deferred.reject ('the end');
        }

        var showp = $('article').map(function(){
            var entry = $(this);
            var img   = entry.find('img').attr('src').trim();
            var url   = entry.find('a').attr('href').trim();

            return getShowInfo(url, cat, img);
        });

        Q.all(showp).done(function (data) {
            data  = _.map (data, function (v) {return v});
            return deferred.resolve(data);
        });
    });

    return deferred.promise;
}

exports.getAllShows =   function(cb) {
    if(cb == null) return;
    var allShows = [];

    var promises = _.map(CATEGORIES, function (cat) {
        deferred[cat] = Q.defer();
        getAllPages(cat, 1)
        return deferred[cat].promise;
    });

    Q.all(promises).done(function (data) {
        console.log ('all done');
        cb(null, _.flatten(data));
    }, function (data) {
        cosole.log ('error');
        cb(data);
    })
}

exports.getAllEpisodes = function (show, cb) {
    if (! show.hasOwnProperty('episodes'))
        return cb ('wrong show object');

    var episodes = _.map(show.episodes, function (e) {
        var d   = Q.defer();

        request.get ({url: BASE_URL + '/clip/ajax/' + e.id,
                        json: true},
                     function (err, res, json) {
                         if (err) d.reject (new Error(err));
                         return d.resolve(json);
                     });

        return d.promise;
    });

    Q.all(episodes).done(function(data) {
        cb (null, {0: data});
    }, function (err) {
        cb (err)
    });
}
