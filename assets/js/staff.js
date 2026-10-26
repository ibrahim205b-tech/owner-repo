/* Staff screen: the page the restaurant phone app shows. Lists new orders, lets staff accept or reject,
 * and moves accepted orders through preparing and delivered. Live updates come from Supabase Realtime. */
(function () {
  "use strict";

  var config = window.HAJJI_CONFIG || {};
  var Data = window.HajjiData;
  var Cart = window.HajjiCart;
  var Order = window.HajjiOrder;
  var client = null;
  var user = null;
  var tab = "new";
  var orders = [];
  var channel = null;
  var rejecting = {}; // orderId -> true while the reason box is open

  var GROUPS = {
    new: ["pending"],
    active: ["accepted", "preparing"],
    done: ["delivered", "rejected", "cancelled"],
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function $(id) { return document.getElementById(id); }
  var fmt = Cart.formatPrice;

  function notice(text, isError) {
    var n = $("staff-notice");
    n.hidden = !text;
    n.textContent = text || "";
    n.style.background = isError ? "#fbeaea" : "";
    n.style.borderColor = isError ? "#efb3ae" : "";
  }

  // ---------- sound and alert for new orders ----------
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      [0, 0.5, 1.0].forEach(function (t) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.25;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.3);
      });
    } catch (e) { /* sound is optional */ }
  }

  function showAlert(text) {
    var a = $("alert");
    a.textContent = text;
    a.hidden = false;
    clearTimeout(showAlert._t);
    showAlert._t = setTimeout(function () { a.hidden = true; }, 15000);
  }

  // ---------- data ----------
  async function loadOrders() {
    var res = await client.from("orders")
      .select("id,created_at,status,customer_name,phone,landmark,lat,lng,notes,total_iqd,reject_reason,order_items(product_name,option_label,qty,line_total)")
      .order("created_at", { ascending: false })
      .limit(120);
    if (res.error) {
      notice("تعذّر تحميل الطلبات. تحقق من الاتصال بالإنترنت.", true);
      return;
    }
    orders = res.data || [];
    render();
  }

  function subscribe() {
    unsubscribe();
    if (!client || !client.channel) return;
    channel = client.channel("staff-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, function (payload) {
        var o = payload.new || {};
        beep();
        showAlert("طلب جديد #" + o.id + " من " + (o.customer_name || "زبون"));
        loadOrders();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, function () {
        loadOrders();
      })
      .subscribe();
  }
  function unsubscribe() {
    if (channel && client && client.removeChannel) client.removeChannel(channel);
    channel = null;
  }

  // ---------- actions ----------
  async function setStatus(orderId, status, reason) {
    var res = await client.rpc("set_order_status", { p_order_id: orderId, p_status: status, p_reason: reason || null });
    if (res.error) {
      notice(Order.errorText(res.error), true);
      return false;
    }
    notice("تم تحديث الطلب #" + orderId + ".");
    await loadOrders();
    return true;
  }

  // ---------- rendering ----------
  function mapLink(o) {
    if (o.lat == null || o.lng == null) return null;
    var url = "https://www.openstreetmap.org/?mlat=" + o.lat + "&mlon=" + o.lng + "#map=18/" + o.lat + "/" + o.lng;
    return el("a", { href: url, target: "_blank", rel: "noopener" }, ["فتح الموقع على الخريطة"]);
  }

  function orderCard(o) {
    var isNew = o.status === "pending";
    var reasonBox = el("input", { class: "field", placeholder: "سبب الرفض (اختياري)", maxlength: 300, style: "width:100%" });
    var reasonRow = el("div", { class: "actions", hidden: !rejecting[o.id] }, [
      reasonBox,
      el("button", { class: "btn danger", type: "button", onclick: async function () {
        var ok = await setStatus(o.id, "rejected", reasonBox.value.trim());
        if (ok) rejecting[o.id] = false;
      } }, ["تأكيد الرفض"]),
    ]);

    var actions = [];
    if (o.status === "pending") {
      actions.push(el("button", { class: "btn", type: "button", onclick: function () { setStatus(o.id, "accepted"); } }, ["قبول الطلب"]));
      actions.push(el("button", { class: "btn danger", type: "button", onclick: function () {
        rejecting[o.id] = !rejecting[o.id];
        render();
      } }, ["رفض"]));
    } else if (o.status === "accepted") {
      actions.push(el("button", { class: "btn", type: "button", onclick: function () { setStatus(o.id, "preparing"); } }, ["بدء التحضير"]));
      actions.push(el("button", { class: "btn ghost", type: "button", onclick: function () { setStatus(o.id, "cancelled"); } }, ["إلغاء"]));
    } else if (o.status === "preparing") {
      actions.push(el("button", { class: "btn", type: "button", onclick: function () { setStatus(o.id, "delivered"); } }, ["تم التسليم"]));
      actions.push(el("button", { class: "btn ghost", type: "button", onclick: function () { setStatus(o.id, "cancelled"); } }, ["إلغاء"]));
    }

    var items = (o.order_items || []).map(function (it) {
      return it.product_name + (it.option_label ? " (" + it.option_label + ")" : "") + " × " + it.qty + " — " + fmt(it.line_total);
    });

    return el("article", { class: "staff-order" + (isNew ? " is-new" : "") }, [
      el("h3", { text: "طلب #" + o.id + " — " + Order.statusLabel(o.status) }),
      el("div", { class: "muted", text: new Date(o.created_at).toLocaleString("ar-IQ") }),
      el("p", { style: "margin:8px 0 2px;font-weight:700", text: o.customer_name || "" }),
      el("p", { style: "margin:0" }, [el("a", { href: "tel:" + (o.phone || "").replace(/\s+/g, ""), text: o.phone || "" })]),
      el("p", { style: "margin:6px 0 0" }, ["أقرب نقطة دالة: " + (o.landmark || "")]),
      mapLink(o),
      o.notes ? el("p", { class: "muted", style: "margin:6px 0 0", text: "ملاحظات: " + o.notes }) : null,
      el("ul", { class: "items" }, items.map(function (t) { return el("li", { text: t }); })),
      el("p", { style: "margin:6px 0", text: "المجموع: " + fmt(o.total_iqd) }),
      o.reject_reason ? el("p", { class: "muted", text: "سبب الرفض: " + o.reject_reason }) : null,
      el("div", { class: "actions" }, actions),
      rejecting[o.id] ? reasonRow : null,
    ]);
  }

  function render() {
    var list = GROUPS[tab];
    var counts = {
      new: orders.filter(function (o) { return GROUPS.new.indexOf(o.status) !== -1; }).length,
      active: orders.filter(function (o) { return GROUPS.active.indexOf(o.status) !== -1; }).length,
    };
    $("count-new").textContent = counts.new ? "(" + counts.new + ")" : "";
    $("count-active").textContent = counts.active ? "(" + counts.active + ")" : "";

    ["new", "active", "done"].forEach(function (k) {
      var b = $("tab-" + k);
      b.setAttribute("aria-selected", String(k === tab));
    });

    var box = $("orders");
    box.innerHTML = "";
    var rows = orders.filter(function (o) { return list.indexOf(o.status) !== -1; });
    if (!rows.length) {
      box.appendChild(el("p", { class: "status", text: tab === "new" ? "لا توجد طلبات جديدة." : "لا توجد طلبات هنا." }));
      return;
    }
    rows.forEach(function (o) { box.appendChild(orderCard(o)); });
  }

  // ---------- auth and boot ----------
  async function checkStaff(u) {
    var res = await client.from("admins").select("user_id").eq("user_id", u.id).maybeSingle();
    return !res.error && !!res.data;
  }

  async function enter(u) {
    if (!(await checkStaff(u))) {
      await client.auth.signOut();
      showLogin("هذا الحساب ليس لديه صلاحية الطلبات.");
      return;
    }
    user = u;
    $("login-panel").hidden = true;
    $("app").hidden = false;
    $("logout").hidden = false;
    await loadOrders();
    subscribe();
  }

  function showLogin(message) {
    user = null;
    unsubscribe();
    $("app").hidden = true;
    $("logout").hidden = true;
    $("login-panel").hidden = false;
    $("login-error").textContent = message || "";
  }

  async function boot() {
    if (!Data.isConfigured(config)) {
      $("login-panel").hidden = false;
      $("login-form").hidden = true;
      $("login-error").textContent = "لم يتم ربط قاعدة البيانات بعد. أضف مفاتيح Supabase في assets/js/config.js.";
      return;
    }
    client = Data.getClient(config);
    var s = await client.auth.getSession();
    if (s.data && s.data.session) await enter(s.data.session.user);
    else showLogin("");
  }

  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.currentTarget);
    $("login-error").textContent = "";
    var res = await client.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
    if (res.error) return showLogin("البريد أو كلمة المرور غير صحيحة.");
    await enter(res.data.user);
  });

  $("logout").addEventListener("click", async function () {
    await client.auth.signOut();
    showLogin("");
  });

  ["new", "active", "done"].forEach(function (k) {
    $("tab-" + k).addEventListener("click", function () { tab = k; render(); });
  });

  // Refresh when the phone comes back to the app, in case a change was missed.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && user) loadOrders();
  });

  boot();
})();
