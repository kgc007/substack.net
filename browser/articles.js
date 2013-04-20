var hyperquest = require('hyperquest');
var JSONStream = require('JSONStream');
var hyperglue = require('hyperglue');
var EventEmitter = require('events').EventEmitter;
var through = require('through');
var inherits = require('inherits');

var vis = require('./vis');

var fs = require('fs');
var html = fs.readFileSync(__dirname + '/html/article.html');

module.exports = function () {
    var uri = 'http://' + window.location.host + '/blog.json?inline=html';
    return new Articles(uri);
};

function Articles (uri) {
    var self = this;
    self.elements = {};
    self.rows = [];
    self.loading = true;
    
    var hq = hyperquest(uri);
    var parser = hq.pipe(JSONStream.parse([ true ]));
    parser.pipe(through(write, end));
    
    function write (row) {
        var title = row.title.replace(/\W+/g, '_');
        var elem = hyperglue(html, {
            '.title': (function () {
                var link = document.createElement('a');
                link.setAttribute('href', '/' + title);
                link.appendChild(document.createTextNode(row.title));
                self.emit('link', link, '/' + title);
                return link;
            })(),
            '.commit': row.commit,
            '.author': row.author,
            '.date': row.date,
            '.body': { _html: row.body },
        });
        addLinks(elem);
        
        var rec = { title: title, date: (new Date(row.date)).valueOf() };
        for (var i = 0; i < self.rows.length; i++) {
            if (self.rows[i].date < rec.date) break;
        }
        self.rows.splice(i, 0, rec);
        
        self.elements[title] = elem;
        self.emit('loaded', title);
        
        if (window.location.hash) {
            var h = window.location.hash;
            window.location.hash = '';
            window.location.hash = h;
        }
    }
    
    function end () {
        self.loading = false;
        self.emit('ready');
    }
};

inherits(Articles, EventEmitter);

Articles.prototype.showAll = function (opts) {
    var self = this;
    if (!opts) opts = {};
    if (opts.summary === undefined) opts.summary = true;
    self.emit('showing', undefined);
    
    if (self.loading) {
        return self.on('ready', function () { self.showAll(opts) });
    }
    
    var titles = Object.keys(self.elements);
    titles.forEach(function (t) {
        var elem = self.elements[t];
        if (opts.summary) {
            elem.className += ' summary';
            elem.addEventListener('click', function (ev) {
                if (!/\bsummary\b/.test(elem.className)) return;
                ev.preventDefault();
                self.emit('show', t);
            });
        }
        vis.show(elem);
    });
};

Articles.prototype.show = function (title) {
    var self = this;
    self.emit('showing', title);
    
    if (self.loading) {
        var onload = function (t) {
            if (t !== title) return vis.hide(self.elements[t]);
            self.removeListener('loaded', onload);
            self.show(title);
        };
        self.on('loaded', onload);
        self.once('showing', function () {
            self.removeListener('loaded', onload);
        });
    }
    
    var titles = Object.keys(self.elements);
    titles.forEach(function (t) {
        vis.hide(self.elements[t]);
    });
    
    var elem = self.elements[title.replace(/\W+/g, '_')];
    if (!elem) return;
    elem.className = elem.className.replace(/\s*\bsummary\b\s*/g, '');
    vis.show(elem);
};

Articles.prototype.appendTo = function (target) {
    var self = this;
    if (typeof target === 'string') target = document.querySelector(target);
    if (self.loading) self.on('loaded', insert);
    Object.keys(self.elements).forEach(insert);
    
    function insert (t) {
        var ix = indexOf(t);
        if (self.rows[ix+1]) {
            target.insertBefore(
                self.elements[t],
                self.elements[self.rows[ix+1].title]
            );
        }
        else {
            target.appendChild(self.elements[t]);
        }
    }
    
    function indexOf (t) {
        for (var i = 0; i < self.rows.length; i++) {
            if (self.rows[i].title === t) return i;
        }
        return -1;
    }
};

function addLinks (elem) {
    var body = elem.querySelector('.body');
    var numbers = {};
    var nodes = [].slice.call(body.childNodes);
    nodes.forEach(function (node) {
        var tag = String(node.tagName).toLowerCase();
        var anchor;
        if (/^h\d+/.test(tag)) {
            var name = node.textContent.replace(/\W+/g, '-');
            anchor = document.createElement('a');
            anchor.setAttribute('name', name);
            anchor.setAttribute('href', '#' + name);
            
            anchor.setAttribute('class', 'article-anchor');
            var cnodes = [].slice.call(node.childNodes);
            cnodes.forEach(function (cn) {
                node.removeChild(cn);
                anchor.appendChild(cn);
            });
            node.appendChild(anchor);
        }
        else if (tag === 'pre') {
            numbers[tag] = (numbers[tag] || 0) + 1;
            anchor = document.createElement('a');
            var name = '_code' + numbers[tag];
            anchor.setAttribute('name', name);
            anchor.setAttribute('href', '#' + name);
            
            anchor.setAttribute('class', 'article-code-anchor');
            anchor.appendChild(document.createTextNode('code link'));
        }
        if (anchor) body.insertBefore(anchor, node);
    });
}
