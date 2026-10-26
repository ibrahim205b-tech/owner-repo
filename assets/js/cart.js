/* Cart logic. Pure functions plus localStorage helpers.
 * The browser never decides the final price: it only sends product ids,
 * option ids and quantities. The server (create_order) reads prices from the database.
 * The totals shown here are for display only. */
(function (root) {
  "use strict";

  var MAX_QTY = 50;
  var STORAGE_KEY = "hajji_cart_v1";

  function clampQty(q) {
    var n = Math.floor(Number(q));
    if (!isFinite(n)) return 1;
    return Math.min(MAX_QTY, Math.max(1, n));
  }

  function keyOf(productId, optionId) {
    return productId + "|" + (optionId || "");
  }

  function add(cart, productId, optionId, qty) {
    var next = cart.slice();
    var key = keyOf(productId, optionId);
    var found = next.find(function (l) { return l.key === key; });
    if (found) {
      found.qty = clampQty(found.qty + clampQty(qty || 1));
    } else {
      next.push({ key: key, productId: productId, optionId: optionId || null, qty: clampQty(qty || 1) });
    }
    return next;
  }

  function setQty(cart, key, qty) {
    var n = Math.floor(Number(qty));
    if (!isFinite(n) || n < 1) return remove(cart, key);
    return cart.map(function (l) {
      return l.key === key ? { key: l.key, productId: l.productId, optionId: l.optionId, qty: Math.min(MAX_QTY, n) } : l;
    });
  }

  function remove(cart, key) {
    return cart.filter(function (l) { return l.key !== key; });
  }

  // Payload sent to create_order: ids and quantities only, never prices.
  function toPayload(cart) {
    return cart.map(function (l) {
      return { product_id: l.productId, option_id: l.optionId || null, qty: l.qty };
    });
  }

  // Resolve a cart line against the menu for display. Returns null if the item no longer exists.
  function resolveLine(line, index) {
    var product = index.productsById[line.productId];
    if (!product) return null;
    var label = null;
    var unit = null;
    if (line.optionId) {
      var opt = (product.options || []).find(function (o) { return o.id === line.optionId; });
      if (!opt) return null;
      unit = opt.price;
      label = opt.label;
    } else {
      if (product.base_price == null) return null;
      unit = product.base_price;
    }
    return { key: line.key, name: product.name, label: label, unit: unit, qty: line.qty, total: unit * line.qty };
  }

  function displayTotal(cart, index) {
    return cart.reduce(function (sum, line) {
      var r = resolveLine(line, index);
      return sum + (r ? r.total : 0);
    }, 0);
  }

  function count(cart) {
    return cart.reduce(function (n, l) { return n + l.qty; }, 0);
  }

  function formatPrice(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " د.ع";
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (l) {
        return l && typeof l.productId === "string" && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_QTY;
      }).map(function (l) {
        return { key: keyOf(l.productId, l.optionId), productId: l.productId, optionId: l.optionId || null, qty: l.qty };
      });
    } catch (e) {
      return [];
    }
  }

  function save(cart) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) { /* storage may be blocked; the cart still works for this page view */ }
  }

  var api = {
    MAX_QTY: MAX_QTY,
    add: add, setQty: setQty, remove: remove, toPayload: toPayload,
    resolveLine: resolveLine, displayTotal: displayTotal, count: count,
    formatPrice: formatPrice, load: load, save: save, keyOf: keyOf,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HajjiCart = api;
})(typeof window !== "undefined" ? window : globalThis);
