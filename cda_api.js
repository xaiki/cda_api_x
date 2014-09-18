/*************************
**  Modules     **
**************************/

var _       =   require('underscore');
var Q       =   require('q');
var request =   require('request');
var cheerio =   require('cheerio');
var moment  =   require('moment');
var dLog    =   require('debug');

var debug = dLog('cda:debug');
var info  = dLog('cda:info');
var warn  = dLog('cda:warn');

/*************************
**  Variables   **
**************************/

var BASE_URL    =   "http://cda.gob.ar";
var CATEGORIES  = ['series-unitarios']; //, 'documentales', 'micros', 'igualdad-cultural']; //

if(typeof(String.prototype.trim) === "undefined")
{
    String.prototype.trim = function()
    {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

var pages = {};
var categories = {};

function flatten (hash) {
    var ret = [];
    _.each (hash, function (v) {
        ret = ret.concat (v)
    });
    return ret;
};

function hack_match (entry) {
    /* XXX(xaiki): HACK
     *
     * Yeah, this looks ugly, it's because the JS regex doesn't capture
     * properly, we should be able to do all this in one go. we can
     * propbably simlpify a tad the first regex. I couldn't really find
     * documentation on why /g changes behaviour like it does… oh you
     * mean JS is b0rkd3d? big surprise
     */

    var ret = {};
    var hack =  entry.html().replace(/<\/?span>/g, '');
    _.map(hack.match(/<h[34]>([^<]+)<\/h[34]>[\n ]*<p>([^<]+)<\/p>/mg),
          function (r) {
              var a = r.match(/<h[34]>([^<:]+)(?::\s+)?<\/h[34]>[\n ]*<p>\s*([^<]+)\s*<\/p>/m).slice(1, 3);
              var key = a[0].toLowerCase();
              if (key === "actores")
                  a[1] = a[1].split(/,\s*/)
              ret[key] = a[1];
          });
    return ret;
}

function getAllPages (cat, start) {
    if (! pages[cat])
        pages[cat] = {};

    var promise = getPagedCategory(cat, start);
    promise.then (function (data) {
        pages[cat][start] = flatten(data);
        return getAllPages(cat, start + 1);
    }, function (data) {
        var ret = flatten(pages[cat]);
        console.log ('finished', data, cat);
        categories[cat].resolve(ret);
        return null;
    });
}

function getShowInfo (url, cat, img) {
    var d     = Q.defer();

    info ('getting show info', BASE_URL + url);
    var slug  = url.split('/').pop();
    request(BASE_URL + url, function (err, res, html) {
        if (err) {
            console.error (url, err);
            return d.reject (new Error(err));
        }

        var id = html.match(/clip_id = (\d+)/m)[1];

        var $ = cheerio.load(html);
        var title = $('h1').text().trim().split(' Cap')[0].split('\n')[0];
        var entry = $('.viewitem').find('.container');

        if (!entry || !entry.html()) {
            return d.resolve (null);
        }

        var vd = $('#video').find('script').html().match(/setup\((.*?)\);/)[1];
        var video = {
            url: vd.match(/file:\s*"([^"]+)"/)[1],
            img: vd.match(/image:\s*"([^"]+)"/)[1]
        };

        debug ('video', video);

        var episodes = [];
        $('section.grid').find('article').each(function (i, el) {
            var cid = $(el).attr('item_id');
            var ep = {id: cid};
            $('meta', el).each(function (i, el) {
                if (el.attribs.itemprop === 'episodeNumber')
                    ep.number = Number(el.attribs.content);
                if (el.attribs.itemprop === 'url')
                    ep.url = el.attribs.content;
            });

            if (!ep.url)
                return null;

            ep.name = ep.url.match(/\/([^\/]+)$/)[1];
            ep.m3u8 = video.url.replace(/clip=[^|]+/, 'clip=' + ep.name);

            episodes.push(ep);
        });

        episodes = flatten(episodes);

        var ret = {show: title, id: id, img: img, episodes: episodes, category: cat, slug: slug};
        return d.resolve(_.extend(ret, hack_match (entry)));
    })
    return d.promise;
}

function getPagedCategory (cat, page) {
    var d = Q.defer();
    var url = BASE_URL + '/' +  cat + '/?page=' + page;

    info ('getting category', url);
    request(url, function(err, res, html){
        if(err) {
            console.log ('error', err);
            return deferred.reject (new Error(err));
        }

        var $ = cheerio.load(html);
        var title, show;

        if ($('article').length == 0) {
            return d.reject ('the end');
        }

        var shows = $('article').map(function(){
            var entry = $(this);
            var name  = entry.find('h3')[0].children[0].data.trim();
            var img   = entry.find('img').attr('src').trim();
            var url   = entry.find('a').attr('href').trim();
            var usplit= url.split('/');
            var slug  = usplit.pop();
            var id    = usplit.pop();

            var episodes = [];
            entry.find('ul').find('li').each(function(i, el) {
                var a = $(this).find('a')[0];
                episodes[i] = {};
                episodes[i].name = a.children[0].data;
                episodes[i].url = a.attribs.href;
            });

            var ret = {show:name, id: id, img: img, category: cat, slug: slug, episodes: episodes};
            return _.extend(ret, hack_match (entry));
        });

        return d.resolve(shows);
    });

    return d.promise;
}

exports.getAllShows = function(cb) {
    if(cb == null) return null;
    var promises = _.map(CATEGORIES, function (cat) {
        var d = categories[cat] = Q.defer();
        getAllPages(cat, 6); // XXX 1
        return d.promise;
    });

    Q.all(promises).done(function (data) {
        console.log ('all done', data);
        cb(null, _.flatten(data));
    }, function (data) {
        console.log ('error');
        cb(data);
    });
};

exports.getAllEpisodes = function (show, cb) {
    if (! show || ! show.hasOwnProperty('episodes'))
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
