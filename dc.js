/* Piccolo motore per le pagine del portfolio (sostituisce il runtime della tela). */
(function () {
  var EV = { onclick: 'click', onmousemove: 'mousemove', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onfocus: 'focus' };
  var HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (o) {
    if (typeof o === 'function') { o = o(this.state, this.props); }
    if (o) { for (var k in o) { this.state[k] = o[k]; } }
    schedule();
  };
  window.DCLogic = DCLogic;

  var comp = null, tpl = null, root = null, queued = false, mounted = false;

  function look(path, scope) {
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) { return undefined; } v = v[parts[i]]; }
    return v;
  }
  function fill(str, scope) {
    return str.replace(HOLE, function (m, p) { var v = look(p, scope); return (v == null || typeof v === 'function') ? '' : String(v); });
  }
  function soloHole(str) { var m = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/.exec(str); return m ? m[1] : null; }

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(fill(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) { return; }
    var tag = node.localName;
    if (tag === 'sc-for') {
      var lp = soloHole(node.getAttribute('list') || ''), as = node.getAttribute('as') || 'item';
      var list = lp ? look(lp, scope) : null;
      if (list && list.length) {
        for (var i = 0; i < list.length; i++) {
          var s = Object.create(scope); s[as] = list[i];
          for (var c = node.firstChild; c; c = c.nextSibling) { build(c, s, out); }
        }
      }
      return;
    }
    if (tag === 'sc-if') {
      var cp = soloHole(node.getAttribute('value') || node.getAttribute('test') || node.getAttribute('when') || '');
      if (cp && look(cp, scope)) { for (var c2 = node.firstChild; c2; c2 = c2.nextSibling) { build(c2, scope, out); } }
      return;
    }
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg' ? document.createElementNS(node.namespaceURI, tag) : document.createElement(tag);
    el.__attrs = {}; el.__h = {};
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a], name = at.name, low = name.toLowerCase();
      if (EV[low]) { var hp = soloHole(at.value); var fn = hp ? look(hp, scope) : null; if (typeof fn === 'function') { el.__h[EV[low]] = fn; } continue; }
      el.__attrs[name] = fill(at.value, scope);
    }
    var kids = [];
    for (var k = node.firstChild; k; k = k.nextSibling) { build(k, scope, kids); }
    el.__kids = kids;
    out.push(el);
  }

  function listen(live) {
    if (!live.__on) { live.__on = {}; }
    for (var t in live.__hh) {
      if (!live.__on[t]) {
        live.__on[t] = true;
        (function (type) { live.addEventListener(type, function (e) { var f = live.__hh && live.__hh[type]; if (f) { f.call(comp, e); } }); })(t);
      }
    }
  }

  function create(v) {
    if (v.nodeType === 3) { return v; }
    var el = v;
    for (var n in el.__attrs) { el.setAttribute(n, el.__attrs[n]); }
    el.__ra = el.__attrs; el.__hh = el.__h; listen(el);
    el.__rc = el.__kids.length;
    for (var i = 0; i < el.__kids.length; i++) { el.appendChild(create(el.__kids[i])); }
    delete el.__kids;
    return el;
  }

  function patch(live, v) {
    if (v.nodeType === 3) {
      if (live.nodeType === 3) { if (live.nodeValue !== v.nodeValue) { live.nodeValue = v.nodeValue; } return live; }
      live.parentNode.replaceChild(v, live); return v;
    }
    if (live.nodeType !== 1 || live.localName !== v.localName || live.__ra === undefined) {
      var fresh = create(v); live.parentNode.replaceChild(fresh, live); return fresh;
    }
    var old = live.__ra, n;
    for (n in v.__attrs) { if (old[n] !== v.__attrs[n]) { live.setAttribute(n, v.__attrs[n]); } }
    for (n in old) { if (!(n in v.__attrs)) { live.removeAttribute(n); } }
    live.__ra = v.__attrs; live.__hh = v.__h; listen(live);
    patchKids(live, v.__kids);
    return live;
  }

  function patchKids(parent, kids) {
    if (!kids.length && !parent.__rc) { return; } /* figli aggiunti dallo script: non toccarli */
    var cur = [];
    for (var c = parent.firstChild, i = 0; c && i < (parent.__rc || 0); c = c.nextSibling, i++) { cur.push(c); }
    for (var j = 0; j < kids.length; j++) {
      if (j < cur.length) { cur[j] = patch(cur[j], kids[j]); }
      else {
        var node = create(kids[j]);
        var ref = cur.length ? cur[cur.length - 1].nextSibling : null;
        parent.insertBefore(node, ref); cur.push(node);
      }
    }
    for (var r = kids.length; r < cur.length; r++) { if (cur[r].parentNode === parent) { parent.removeChild(cur[r]); } }
    parent.__rc = kids.length;
  }

  function render() {
    queued = false;
    var vals = comp.renderVals ? comp.renderVals() : {};
    var out = [];
    for (var c = tpl.firstChild; c; c = c.nextSibling) { build(c, vals, out); }
    if (!mounted) {
      root.__rc = 0; patchKids(root, out); mounted = true;
      if (comp.componentDidMount) { comp.componentDidMount(); }
    } else {
      patchKids(root, out);
      if (comp.componentDidUpdate) { comp.componentDidUpdate(); }
    }
  }
  function schedule() { if (!mounted || queued) { return; } queued = true; Promise.resolve().then(render); }

  window.DCStart = function (Component) {
    var t = document.getElementById('dc-template');
    tpl = t.content; root = document.getElementById('dc-root');
    comp = new Component({});
    if (!comp.state) { comp.state = {}; }
    render();
  };
})();
