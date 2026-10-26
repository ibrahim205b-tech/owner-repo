/* Admin panel. Every write goes to Supabase, where Row Level Security allows it only for admins.
 * Hiding items uses is_active, so nothing is deleted and old orders keep their data. */
(function () {
  "use strict";

  var config = window.HAJJI_CONFIG || {};
  var Data = window.HajjiData;
  var client = null;
  var state = { sections: [], products: [], orders: null, tab: "menu", search: "" };

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
  function fmt(n) { return window.HajjiCart.formatPrice(n); }
  function $(id) { return document.getElementById(id); }

  function notice(text, isError) {
    var n = $("admin-notice");
    n.hidden = !text;
    n.textContent = text || "";
    n.style.background = isError ? "#fbeaea" : "";
    n.style.borderColor = isError ? "#efb3ae" : "";
  }

  function fail(err) {
    var msg = (err && err.message) || "حدث خطأ غير متوقع";
    if (msg.indexOf("row-level security") !== -1 || msg.indexOf("permission denied") !== -1) {
      msg = "ليس لديك صلاحية لهذا الإجراء.";
    }
    notice(msg, true);
  }

  // ---------- auth ----------
  async function checkAdmin(user) {
    var res = await client.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return !res.error && !!res.data;
  }

  async function showLogin(message) {
    $("app").hidden = true;
    $("logout").hidden = true;
    $("login-panel").hidden = false;
    $("login-error").textContent = message || "";
  }

  async function enter(user) {
    if (!(await checkAdmin(user))) {
      await client.auth.signOut();
      return showLogin("هذا الحساب ليس لديه صلاحية إدارة.");
    }
    $("login-panel").hidden = true;
    $("app").hidden = false;
    $("logout").hidden = false;
    $("who").textContent = user.email || "";
    await reloadAll();
  }

  async function init() {
    if (!Data.isConfigured(config)) {
      $("login-panel").hidden = false;
      $("login-error").textContent = "لم يتم ربط قاعدة البيانات بعد. أضف مفاتيح Supabase في assets/js/config.js.";
      $("login-form").hidden = true;
      return;
    }
    client = Data.getClient(config);
    var s = await client.auth.getSession();
    if (s.data && s.data.session) await enter(s.data.session.user);
    else await showLogin("");
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

  // ---------- data ----------
  async function reloadAll() {
    var s = await client.from("sections").select("id,name,sort_order,is_active").order("sort_order", { ascending: true });
    if (s.error) return fail(s.error);
    var p = await client.from("products")
      .select("id,section_id,name,description,image_url,base_price,sort_order,is_active,product_options(id,label,price,sort_order,is_active)")
      .order("sort_order", { ascending: true });
    if (p.error) return fail(p.error);
    state.sections = s.data;
    state.products = p.data.map(function (x) {
      x.product_options = (x.product_options || []).sort(function (a, b) { return a.sort_order - b.sort_order; });
      return x;
    });
    render();
  }

  // ---------- rendering ----------
  function render() {
    document.querySelectorAll(".tab").forEach(function (t) {
      var active = t.id === "tab-" + state.tab;
      t.setAttribute("aria-selected", String(active));
    });
    if (state.tab === "menu") renderMenu(); else renderOrders();
  }

  function renderMenu() {
    var panel = $("panel");
    panel.innerHTML = "";

    var search = el("input", { class: "field", type: "search", placeholder: "بحث باسم الصنف", value: state.search, oninput: function (e) { state.search = e.target.value; renderList(); } });
    var sectionSelect = el("select", { class: "field" }, state.sections.map(function (s) { return el("option", { value: s.id, text: s.name }); }));
    var addName = el("input", { class: "field", placeholder: "اسم الصنف الجديد" });
    var addPrice = el("input", { class: "field small-num", type: "number", min: "1", placeholder: "السعر" });
    var addBtn = el("button", { class: "btn small", type: "button", onclick: async function () {
      var name = addName.value.trim();
      var price = parseInt(addPrice.value, 10);
      if (name.length < 2 || !(price > 0)) return notice("أدخل اسم الصنف وسعراً صحيحاً.", true);
      var sort = Math.max(0, ...state.products.map(function (p) { return p.sort_order || 0; })) + 1;
      var id = "p-" + Date.now().toString(36);
      var res = await client.from("products").insert({ id: id, section_id: sectionSelect.value, name: name, base_price: price, sort_order: sort, is_active: true });
      if (res.error) return fail(res.error);
      notice("تمت إضافة الصنف.");
      addName.value = ""; addPrice.value = "";
      await reloadAll();
    } }, ["إضافة صنف"]);

    var newSectionName = el("input", { class: "field", placeholder: "اسم قسم جديد" });
    var addSectionBtn = el("button", { class: "btn small ghost", type: "button", onclick: async function () {
      var name = newSectionName.value.trim();
      if (name.length < 2) return notice("أدخل اسم القسم.", true);
      var sort = Math.max(0, ...state.sections.map(function (s) { return s.sort_order || 0; })) + 1;
      var res = await client.from("sections").insert({ id: "s-" + Date.now().toString(36), name: name, sort_order: sort, is_active: true });
      if (res.error) return fail(res.error);
      newSectionName.value = "";
      notice("تمت إضافة القسم.");
      await reloadAll();
    } }, ["إضافة قسم"]);

    panel.appendChild(el("div", { class: "toolbar" }, [search]));
    panel.appendChild(el("div", { class: "toolbar" }, [sectionSelect, addName, addPrice, addBtn]));
    panel.appendChild(el("div", { class: "toolbar" }, [newSectionName, addSectionBtn]));
    panel.appendChild(el("div", { id: "list" }));
    renderList();
  }

  function renderList() {
    var list = $("list");
    if (!list) return;
    list.innerHTML = "";
    var q = state.search.trim();
    state.sections.forEach(function (s) {
      var items = state.products.filter(function (p) {
        return p.section_id === s.id && (!q || p.name.indexOf(q) !== -1);
      });
      var header = el("h3", { style: "margin:18px 0 8px" }, [
        s.name + " ",
        el("span", { class: "muted", text: "(" + items.length + " صنف)" }),
        s.is_active ? null : el("span", { class: "badge", text: "مخفي" }),
      ]);
      list.appendChild(header);
      if (!items.length && !q) list.appendChild(el("p", { class: "muted", text: "لا توجد أصناف في هذا القسم." }));
      items.forEach(function (p) { list.appendChild(productRow(p)); });
    });
  }

  function productRow(p) {
    var hasOptions = p.product_options.length > 0;
    var activeOptions = p.product_options.filter(function (o) { return o.is_active; });
    var nameIn = el("input", { class: "field", value: p.name, "aria-label": "اسم الصنف" });
    var priceIn = el("input", { class: "field small-num", type: "number", min: "1", value: p.base_price == null ? "" : String(p.base_price), disabled: hasOptions, placeholder: hasOptions ? "حسب الحجم" : "السعر", "aria-label": "السعر" });
    var sectionSel = el("select", { class: "field", "aria-label": "القسم" }, state.sections.map(function (s) {
      return el("option", { value: s.id, selected: s.id === p.section_id, text: s.name });
    }));
    var descIn = el("input", { class: "field", value: p.description || "", placeholder: "وصف مختصر (اختياري)", "aria-label": "وصف الصنف", style: "flex:1;min-width:180px" });
    var imgIn = el("input", { class: "field", type: "url", value: p.image_url || "", placeholder: "رابط صورة مرخصة (اختياري)", "aria-label": "رابط الصورة", style: "flex:1;min-width:180px" });

    var warn = (!hasOptions && p.base_price == null) || (hasOptions && activeOptions.length === 0)
      ? el("span", { class: "badge", style: "background:#fbeaea", text: "لا يوجد سعر أو حجم متاح" }) : null;

    var row = el("div", { class: "admin-product" + (p.is_active ? "" : " hidden-item") }, [
      el("div", { class: "row" }, [
        nameIn, priceIn, sectionSel,
        el("button", { class: "btn small", type: "button", onclick: async function () {
          var patch = {
            name: nameIn.value.trim(),
            section_id: sectionSel.value,
            description: descIn.value.trim() || null,
            image_url: imgIn.value.trim() || null,
          };
          if (patch.name.length < 2) return notice("اسم الصنف قصير جداً.", true);
          if (patch.image_url && !/^https:\/\//.test(patch.image_url)) return notice("رابط الصورة يجب أن يبدأ بـ https://", true);
          if (!hasOptions) {
            var price = parseInt(priceIn.value, 10);
            if (!(price > 0)) return notice("أدخل سعراً صحيحاً.", true);
            patch.base_price = price;
          }
          var res = await client.from("products").update(patch).eq("id", p.id);
          if (res.error) return fail(res.error);
          notice("تم الحفظ.");
          await reloadAll();
        } }, ["حفظ"]),
        el("button", { class: "btn small ghost", type: "button", onclick: async function () {
          var res = await client.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
          if (res.error) return fail(res.error);
          await reloadAll();
        } }, [p.is_active ? "إخفاء" : "إظهار"]),
        warn,
      ]),
      el("div", { class: "row", style: "margin-top:8px" }, [descIn, imgIn]),
    ]);

    // Size options
    if (hasOptions || p.base_price == null) {
      p.product_options.forEach(function (o) {
        var lab = el("input", { class: "field", value: o.label, "aria-label": "اسم الحجم" });
        var pr = el("input", { class: "field small-num", type: "number", min: "1", value: String(o.price), "aria-label": "سعر الحجم" });
        row.appendChild(el("div", { class: "row opt-row" }, [
          lab, pr,
          el("button", { class: "btn small", type: "button", onclick: async function () {
            var price = parseInt(pr.value, 10);
            if (!(price > 0) || !lab.value.trim()) return notice("أدخل اسم الحجم وسعراً صحيحاً.", true);
            var res = await client.from("product_options").update({ label: lab.value.trim(), price: price }).eq("id", o.id);
            if (res.error) return fail(res.error);
            notice("تم حفظ الحجم.");
            await reloadAll();
          } }, ["حفظ"]),
          el("button", { class: "btn small ghost", type: "button", onclick: async function () {
            var res = await client.from("product_options").update({ is_active: !o.is_active }).eq("id", o.id);
            if (res.error) return fail(res.error);
            await reloadAll();
          } }, [o.is_active ? "إخفاء الحجم" : "إظهار الحجم"]),
        ]));
      });

      var newLabel = el("input", { class: "field", placeholder: "اسم الحجم (مثل: صغير)" });
      var newPrice = el("input", { class: "field small-num", type: "number", min: "1", placeholder: "السعر" });
      row.appendChild(el("div", { class: "row opt-row" }, [
        newLabel, newPrice,
        el("button", { class: "btn small ghost", type: "button", onclick: async function () {
          var price = parseInt(newPrice.value, 10);
          if (!newLabel.value.trim() || !(price > 0)) return notice("أدخل اسم الحجم وسعراً صحيحاً.", true);
          var sort = Math.max(0, ...p.product_options.map(function (o) { return o.sort_order || 0; })) + 1;
          // A product uses either one price or sizes. Adding a size clears the single price.
          if (p.base_price != null) {
            var clear = await client.from("products").update({ base_price: null }).eq("id", p.id);
            if (clear.error) return fail(clear.error);
          }
          var res = await client.from("product_options").insert({
            id: p.id + "-o" + Date.now().toString(36), product_id: p.id, label: newLabel.value.trim(), price: price, sort_order: sort, is_active: true,
          });
          if (res.error) return fail(res.error);
          notice("تمت إضافة الحجم.");
          await reloadAll();
        } }, ["إضافة حجم"]),
      ]));
    }
    return row;
  }

  // ---------- orders ----------
  // Must match set_order_status in schema.sql.
  function allowedNext(status) {
    if (status === "pending") return ["accepted", "rejected"];
    if (status === "accepted") return ["preparing", "cancelled"];
    if (status === "preparing") return ["delivered", "cancelled"];
    return [];
  }

  async function renderOrders() {
    var panel = $("panel");
    panel.innerHTML = "";
    panel.appendChild(el("p", { class: "muted", text: "جارٍ تحميل الطلبات..." }));
    var res = await client.from("orders")
      .select("id,created_at,customer_name,phone,landmark,lat,lng,notes,total_iqd,status,reject_reason,order_items(product_name,option_label,unit_price,qty,line_total)")
      .order("created_at", { ascending: false })
      .limit(100);
    panel.innerHTML = "";
    if (res.error) return fail(res.error);
    if (!res.data.length) {
      panel.appendChild(el("p", { class: "muted", text: "لا توجد طلبات بعد." }));
      return;
    }
    var labels = { pending: "بانتظار الرد", accepted: "مقبول", preparing: "قيد التحضير", delivered: "تم التسليم", rejected: "مرفوض", cancelled: "ملغي" };
    var rows = res.data.map(function (o) {
      // Status changes go through set_order_status, the same rules the staff app uses.
      var sel = el("select", { class: "field", "aria-label": "حالة الطلب", onchange: async function (e) {
        var r = await client.rpc("set_order_status", { p_order_id: o.id, p_status: e.target.value, p_reason: null });
        if (r.error) { e.target.value = o.status; return fail(r.error); }
        notice("تم تحديث حالة الطلب " + o.id + ".");
        renderOrders();
      } }, Object.keys(labels).map(function (st) {
        return el("option", { value: st, selected: st === o.status, disabled: st !== o.status && !allowedNext(o.status).includes(st), text: labels[st] });
      }));
      var items = (o.order_items || []).map(function (it) {
        return it.product_name + (it.option_label ? " (" + it.option_label + ")" : "") + " × " + it.qty + " = " + fmt(it.line_total);
      }).join("\n");
      var where = o.lat != null
        ? el("a", { href: "https://www.openstreetmap.org/?mlat=" + o.lat + "&mlon=" + o.lng + "#map=18/" + o.lat + "/" + o.lng, target: "_blank", rel: "noopener", text: "الموقع على الخريطة" })
        : null;
      return el("tr", null, [
        el("td", null, ["#" + o.id, el("div", { class: "muted", text: new Date(o.created_at).toLocaleString("ar-IQ") })]),
        el("td", null, [o.customer_name, el("div", { class: "muted", text: o.phone })]),
        el("td", null, [o.landmark, where, o.notes ? el("div", { class: "muted", text: o.notes }) : null]),
        el("td", { style: "white-space:pre-line" }, [items]),
        el("td", null, [el("strong", { text: fmt(o.total_iqd) }), o.reject_reason ? el("div", { class: "muted", text: "سبب الرفض: " + o.reject_reason }) : null]),
        el("td", null, [sel]),
      ]);
    });
    panel.appendChild(el("table", { class: "orders" }, [
      el("thead", null, [el("tr", null, ["الطلب", "الزبون", "الموقع", "الأصناف", "المجموع", "الحالة"].map(function (h) { return el("th", { text: h }); }))]),
      el("tbody", null, rows),
    ]));
  }

  // ---------- tabs ----------
  $("tab-menu").addEventListener("click", function () { state.tab = "menu"; render(); if (client) reloadAll(); });
  $("tab-orders").addEventListener("click", function () { state.tab = "orders"; render(); });

  init();
})();
