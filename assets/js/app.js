/* Customer site: menu, Google sign-in, map location, cart, checkout, and live order updates. */
(function () {
  "use strict";

  var config = window.HAJJI_CONFIG || {};
  var Cart = window.HajjiCart;
  var Data = window.HajjiData;
  var Order = window.HajjiOrder;

  var menu = null;
  var index = null;
  var cart = Cart.load();
  var client = null;
  var user = null;
  var orderingEnabled = false;
  var view = "cart"; // "cart" | "orders"
  var pick = { lat: null, lng: null, map: null, marker: null };
  var cardState = {};
  var liveChannel = null;

  // ---------- helpers ----------
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
  var fmt = Cart.formatPrice;
  function $(id) { return document.getElementById(id); }

  // ---------- menu ----------
  function renderNav() {
    var list = $("cat-list");
    list.innerHTML = "";
    index.visibleSections.forEach(function (s) {
      list.appendChild(el("li", null, [el("a", { href: "#sec-" + s.id, text: s.name.replace(/^قسم\s+/, "") })]));
    });
    $("cats").hidden = false;
  }

  function productCard(p) {
    var state = cardState[p.id] || (cardState[p.id] = { optionId: p.options.length === 1 ? p.options[0].id : null, qty: 1 });
    var thumb = p.image_url
      ? el("div", { class: "thumb" }, [el("img", { src: p.image_url, alt: p.name, loading: "lazy" })])
      : el("div", { class: "thumb" });
    var priceEl = el("div", { class: "price" });
    var qtyOut = el("output", { text: String(state.qty) });
    var addBtn = el("button", { class: "btn", type: "button" }, [orderingEnabled ? "أضف إلى السلة" : "الطلب غير متاح حالياً"]);
    var optionsWrap = null;

    function currentUnit() {
      if (p.options.length) {
        var opt = p.options.find(function (o) { return o.id === state.optionId; });
        return opt ? opt.price : null;
      }
      return p.base_price;
    }
    function refresh() {
      var unit = currentUnit();
      priceEl.textContent = unit == null ? "اختر الحجم" : fmt(unit * state.qty);
      qtyOut.textContent = String(state.qty);
      addBtn.disabled = !orderingEnabled || (p.options.length > 0 && !state.optionId);
      if (optionsWrap) {
        Array.prototype.forEach.call(optionsWrap.querySelectorAll("button.option"), function (b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === state.optionId));
        });
      }
    }

    if (p.options.length) {
      optionsWrap = el("div", { class: "options", role: "group", "aria-label": "اختر الحجم" },
        p.options.map(function (o) {
          return el("button", {
            class: "option", type: "button", "data-id": o.id, "aria-pressed": "false",
            onclick: function () { state.optionId = o.id; refresh(); },
          }, [o.label, el("span", { text: fmt(o.price) })]);
        }));
    }

    var stepper = el("div", { class: "qty" }, [
      el("button", { type: "button", "aria-label": "تقليل الكمية", onclick: function () { state.qty = Math.max(1, state.qty - 1); refresh(); } }, ["−"]),
      qtyOut,
      el("button", { type: "button", "aria-label": "زيادة الكمية", onclick: function () { state.qty = Math.min(Cart.MAX_QTY, state.qty + 1); refresh(); } }, ["+"]),
    ]);

    addBtn.addEventListener("click", function () {
      cart = Cart.add(cart, p.id, state.optionId, state.qty);
      Cart.save(cart);
      state.qty = 1;
      refresh();
      updateCartCount();
      flash(addBtn, "تمت الإضافة");
    });

    refresh();
    return el("article", { class: "card" }, [
      thumb,
      el("h3", { text: p.name }),
      p.description ? el("p", { class: "desc", text: p.description }) : null,
      optionsWrap,
      el("div", null, [priceEl]),
      el("div", { class: "add-row" }, [stepper, addBtn]),
    ]);
  }

  function flash(btn, text) {
    var original = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = original; }, 900);
  }

  function renderMenu() {
    var root = $("menu");
    root.innerHTML = "";
    index.visibleSections.forEach(function (s) {
      var products = index.productsBySection[s.id] || [];
      root.appendChild(el("section", { class: "menu-section", id: "sec-" + s.id, "aria-labelledby": "h-" + s.id }, [
        el("h2", { id: "h-" + s.id, text: s.name }),
        el("div", { class: "grid" }, products.map(productCard)),
      ]));
    });
    if (!index.visibleSections.length) {
      root.appendChild(el("p", { class: "status", text: "لا توجد أصناف متاحة حالياً." }));
    }
  }

  function setNotice(text) {
    var area = $("notice-area");
    area.innerHTML = "";
    if (text) area.appendChild(el("p", { class: "notice", text: text }));
  }

  function updateCartCount() {
    $("cart-count").textContent = String(Cart.count(cart));
  }

  // ---------- account ----------
  function displayName(u) {
    var m = (u && u.user_metadata) || {};
    return m.full_name || m.name || (u && u.email ? u.email.split("@")[0] : "");
  }

  function renderAccount() {
    var box = $("account");
    box.innerHTML = "";
    if (!orderingEnabled) {
      // Show the sign-in button even before the backend is connected, so visitors see it.
      box.appendChild(el("button", {
        class: "btn small ghost",
        type: "button",
        disabled: true,
        title: "تسجيل الدخول يُفعَّل بعد ربط قاعدة البيانات",
      }, ["دخول بحساب Gmail"]));
      return;
    }
    if (user) {
      box.appendChild(el("button", { class: "btn small ghost", type: "button", onclick: function () { openDrawer("orders"); } }, ["طلباتي"]));
      box.appendChild(el("button", { class: "btn small ghost", type: "button", onclick: signOut }, ["خروج"]));
    } else {
      box.appendChild(el("button", { class: "btn small ghost", type: "button", onclick: signIn }, ["دخول بحساب Gmail"]));
    }
  }

  async function signIn() {
    if (!client) return;
    var redirectTo = window.location.origin + window.location.pathname;
    var res = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo } });
    if (res && res.error) showToast("تعذّر تسجيل الدخول. حاول مرة أخرى.", "error");
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    closeDrawer();
  }

  function setUser(u) {
    var was = user && user.id;
    user = u || null;
    renderAccount();
    if (user && user.id !== was) subscribeLive();
    if (!user) unsubscribeLive();
    if (!$("cart-drawer").hidden && view === "orders") renderOrders();
    if (!$("cart-drawer").hidden && view === "cart") renderCart();
  }

  // ---------- live order updates ----------
  function subscribeLive() {
    unsubscribeLive();
    if (!client || !user || !client.channel) return;
    liveChannel = client.channel("my-orders-" + user.id)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders",
        filter: "customer_user_id=eq." + user.id,
      }, function (payload) {
        var o = payload.new || {};
        var msg = Order.statusMessage(o);
        if (msg) showToast(msg, o.status === "rejected" ? "error" : "ok");
        if (!$("cart-drawer").hidden && view === "orders") renderOrders();
      })
      .subscribe();
  }
  function unsubscribeLive() {
    if (liveChannel && client && client.removeChannel) client.removeChannel(liveChannel);
    liveChannel = null;
  }

  function showToast(text, kind) {
    var t = $("toast");
    t.textContent = text;
    t.className = "toast " + (kind || "ok");
    t.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.hidden = true; }, 8000);
  }

  // ---------- drawer ----------
  function openDrawer(mode) {
    view = mode || "cart";
    $("overlay").hidden = false;
    $("cart-drawer").hidden = false;
    if (view === "orders") renderOrders(); else renderCart();
    $("close-cart").focus();
  }
  function closeDrawer() {
    $("overlay").hidden = true;
    $("cart-drawer").hidden = true;
    destroyMap();
    $("open-cart").focus();
  }

  // ---------- map ----------
  var DEFAULT_CENTER = [33.3152, 44.3661]; // Baghdad

  function destroyMap() {
    if (pick.map) { pick.map.remove(); }
    pick.map = null; pick.marker = null;
  }

  function setPick(lat, lng) {
    pick.lat = lat; pick.lng = lng;
    var label = $("coords");
    if (label) label.textContent = lat == null ? "لم تحدد الموقع بعد" : "الموقع المحدد: " + lat.toFixed(5) + ", " + lng.toFixed(5);
    if (pick.marker) pick.marker.setLatLng([lat, lng]);
  }

  function initMap() {
    var holder = $("map-pick");
    if (!holder) return;
    if (!window.L) {
      holder.textContent = "الخريطة غير متاحة الآن. استخدم زر الموقع الحالي أو حاول مرة أخرى.";
      return;
    }
    destroyMap();
    var start = pick.lat != null ? [pick.lat, pick.lng] : DEFAULT_CENTER;
    pick.map = window.L.map(holder).setView(start, pick.lat != null ? 17 : 13);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(pick.map);
    pick.marker = window.L.marker(start, { draggable: true }).addTo(pick.map);
    if (pick.lat != null) setPick(pick.lat, pick.lng);
    pick.marker.on("dragend", function () {
      var p = pick.marker.getLatLng();
      setPick(p.lat, p.lng);
    });
    pick.map.on("click", function (e) {
      setPick(e.latlng.lat, e.latlng.lng);
    });
    setTimeout(function () { if (pick.map) pick.map.invalidateSize(); }, 150);
  }

  function useMyLocation() {
    var btn = $("locate-btn");
    if (!navigator.geolocation) {
      showToast("جهازك لا يدعم تحديد الموقع. حدد موقعك على الخريطة.", "error");
      return;
    }
    btn.disabled = true;
    btn.textContent = "جارٍ تحديد موقعك...";
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      btn.textContent = "استخدام موقعي الحالي";
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      setPick(lat, lng);
      if (pick.map) pick.map.setView([lat, lng], 17);
    }, function () {
      btn.disabled = false;
      btn.textContent = "استخدام موقعي الحالي";
      showToast("لم نتمكن من تحديد موقعك. اسمح بالوصول للموقع أو حدده على الخريطة.", "error");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  // ---------- cart ----------
  function removeLine(key) {
    cart = Cart.remove(cart, key);
    Cart.save(cart);
    updateCartCount();
    renderCart();
  }
  function changeQty(key, qty) {
    cart = Cart.setQty(cart, key, qty);
    Cart.save(cart);
    updateCartCount();
    renderCart();
  }

  function renderCart(successInfo) {
    var body = $("cart-body");
    var footer = $("cart-footer");
    body.innerHTML = "";
    footer.innerHTML = "";
    destroyMap();

    if (successInfo) {
      body.appendChild(el("div", { class: "success" }, [
        "تم إرسال طلبك رقم " + successInfo.order_id + ". المجموع: " + fmt(successInfo.total_iqd) + ". الدفع عند الاستلام.",
      ]));
      body.appendChild(el("p", { class: "muted", text: "سنعلمك هنا فور رد المطعم على طلبك." }));
      footer.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () { openDrawer("orders"); } }, ["عرض طلباتي"]));
      return;
    }

    if (!cart.length) {
      body.appendChild(el("p", { class: "status", text: "السلة فارغة." }));
      return;
    }

    var total = 0;
    var hasMissing = false;
    cart.forEach(function (line) {
      var r = Cart.resolveLine(line, index);
      if (!r) {
        hasMissing = true;
        body.appendChild(el("div", { class: "cart-line" }, [
          el("div", null, [el("div", { class: "name", text: "صنف غير متوفر" }), el("div", { class: "meta", text: "احذفه للمتابعة" })]),
          el("button", { class: "btn small danger", type: "button", onclick: function () { removeLine(line.key); } }, ["حذف"]),
        ]));
        return;
      }
      total += r.total;
      body.appendChild(el("div", { class: "cart-line" }, [
        el("div", null, [
          el("div", { class: "name", text: r.name }),
          r.label ? el("div", { class: "meta", text: "الحجم: " + r.label }) : null,
          el("div", { class: "meta", text: fmt(r.unit) + " للقطعة" }),
        ]),
        el("div", { class: "side" }, [
          el("div", { class: "price", text: fmt(r.total) }),
          el("div", { class: "qty" }, [
            el("button", { type: "button", "aria-label": "تقليل", onclick: function () { changeQty(line.key, r.qty - 1); } }, ["−"]),
            el("output", { text: String(r.qty) }),
            el("button", { type: "button", "aria-label": "زيادة", onclick: function () { changeQty(line.key, Math.min(Cart.MAX_QTY, r.qty + 1)); } }, ["+"]),
          ]),
          el("button", { class: "btn small ghost", type: "button", onclick: function () { removeLine(line.key); } }, ["حذف"]),
        ]),
      ]));
    });

    body.appendChild(el("div", { class: "total-row" }, [el("span", { text: "المجموع التقريبي" }), el("strong", { text: fmt(total) })]));

    if (!user) {
      body.appendChild(el("div", { class: "login-prompt" }, [
        el("p", { text: "سجّل الدخول بحساب Gmail لتحديد موقعك وإرسال الطلب." }),
        el("button", { class: "btn", type: "button", onclick: signIn, disabled: !orderingEnabled }, ["دخول بحساب Gmail"]),
      ]));
      return;
    }

    var form = el("form", { class: "checkout", id: "checkout" }, [
      el("label", null, ["الاسم", el("input", { name: "name", required: true, minlength: 2, maxlength: 100, autocomplete: "name", value: displayName(user) })]),
      el("label", null, ["رقم الهاتف للتوصيل", el("input", { name: "phone", required: true, inputmode: "tel", autocomplete: "tel", placeholder: "07xxxxxxxxx" })]),
      el("div", { class: "map-field" }, [
        el("span", { class: "map-title", text: "حدد موقعك بالضبط على الخريطة" }),
        el("div", { id: "map-pick", class: "map-pick" }),
        el("div", { class: "map-actions" }, [
          el("button", { id: "locate-btn", class: "btn small ghost", type: "button", onclick: useMyLocation }, ["استخدام موقعي الحالي"]),
          el("span", { id: "coords", class: "muted" }, [pick.lat == null ? "لم تحدد الموقع بعد" : "الموقع المحدد: " + pick.lat.toFixed(5) + ", " + pick.lng.toFixed(5)]),
        ]),
      ]),
      el("label", null, ["أقرب نقطة دالة عليك", el("input", { name: "landmark", required: true, minlength: 3, maxlength: 200, placeholder: "مثال: قرب صيدلية الأمل، مقابل المدرسة" })]),
      el("label", null, ["ملاحظات (اختياري)", el("textarea", { name: "notes", maxlength: 500 })]),
      el("p", { class: "form-error", id: "form-error", role: "alert" }),
    ]);

    var submit = el("button", { class: "btn", type: "submit", disabled: !orderingEnabled || hasMissing }, [
      !orderingEnabled ? "الطلب غير متاح حالياً" : "إرسال الطلب",
    ]);
    form.appendChild(submit);
    body.appendChild(form);

    footer.appendChild(el("p", { class: "muted", style: "margin:0 0 6px;font-size:13px", text: "الدفع عند الاستلام. السعر النهائي يُحسب على الخادم عند إرسال الطلب." }));
    if (hasMissing) footer.appendChild(el("p", { class: "form-error", text: "احذف الأصناف غير المتوفرة قبل إرسال الطلب." }));

    form.addEventListener("submit", submitOrder);
    initMap();
  }

  async function submitOrder(ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var errorEl = $("form-error");
    errorEl.textContent = "";
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var phone = String(fd.get("phone") || "").trim();
    var landmark = String(fd.get("landmark") || "").trim();
    var notes = String(fd.get("notes") || "").trim();

    var problem = Order.validateForm({ name: name, phone: phone, landmark: landmark, lat: pick.lat, lng: pick.lng });
    if (problem) { errorEl.textContent = problem; return; }

    var submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "جارٍ إرسال الطلب...";

    var lines = cart.map(function (line) {
      var r = Cart.resolveLine(line, index);
      return { name: r ? r.name : "", label: r ? r.label : null, qty: line.qty };
    });
    try {
      var res = await client.rpc("create_order", {
        p_customer_name: name, p_phone: phone, p_lat: pick.lat, p_lng: pick.lng,
        p_landmark: landmark, p_notes: notes, p_items: Cart.toPayload(cart),
      });
      if (res.error) throw res.error;
      var result = res.data;
      cart = [];
      Cart.save(cart);
      updateCartCount();
      pick.lat = null; pick.lng = null;
      renderCart({ order_id: result.order_id, total_iqd: result.total_iqd, lines: lines });
    } catch (err) {
      errorEl.textContent = Order.errorText(err);
      submit.disabled = false;
      submit.textContent = "إرسال الطلب";
    }
  }

  // ---------- my orders ----------
  async function renderOrders() {
    var body = $("cart-body");
    var footer = $("cart-footer");
    body.innerHTML = "";
    footer.innerHTML = "";
    destroyMap();
    $("cart-title").textContent = "طلباتي";
    if (!user || !client) {
      body.appendChild(el("p", { class: "status", text: "سجّل الدخول لعرض طلباتك." }));
      return;
    }
    body.appendChild(el("p", { class: "status", text: "جارٍ تحميل طلباتك..." }));
    var res = await client.from("orders")
      .select("id,created_at,status,total_iqd,reject_reason,landmark,order_items(product_name,option_label,qty,line_total)")
      .order("created_at", { ascending: false })
      .limit(20);
    body.innerHTML = "";
    if (res.error) {
      body.appendChild(el("p", { class: "form-error", text: "تعذّر تحميل الطلبات. حاول مرة أخرى." }));
      return;
    }
    if (!res.data.length) {
      body.appendChild(el("p", { class: "status", text: "لا توجد طلبات بعد." }));
    }
    res.data.forEach(function (o) {
      var msg = Order.statusMessage(o);
      body.appendChild(el("div", { class: "order-card" }, [
        el("div", { class: "order-head" }, [
          el("strong", { text: "طلب #" + o.id }),
          el("span", { class: "badge " + o.status, text: Order.statusLabel(o.status) }),
        ]),
        el("div", { class: "muted", text: new Date(o.created_at).toLocaleString("ar-IQ") }),
        el("ul", { class: "order-items" }, (o.order_items || []).map(function (it) {
          return el("li", { text: it.product_name + (it.option_label ? " (" + it.option_label + ")" : "") + " × " + it.qty + " — " + fmt(it.line_total) });
        })),
        el("div", { class: "total-row" }, [el("span", { text: "المجموع" }), el("strong", { text: fmt(o.total_iqd) })]),
        msg ? el("p", { class: "order-msg", text: msg }) : null,
      ]));
    });
    footer.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () { $("cart-title").textContent = "سلة المشتريات"; openDrawer("cart"); } }, ["العودة إلى السلة"]));
  }

  // ---------- boot ----------
  async function boot() {
    document.title = (config.restaurantName || "المنيو") + " - المنيو";
    orderingEnabled = Data.isConfigured(config) && !!Data.getClient(config);
    client = orderingEnabled ? Data.getClient(config) : null;
    try {
      menu = await Data.loadMenu(config);
      index = Data.buildIndex(menu);
      $("status").hidden = true;
      if (menu.source === "fallback") {
        setNotice("المنيو معروض كما هو في القائمة الرسمية. الطلب أونلاين سيُفعَّل بعد ربط قاعدة البيانات.");
      } else if (!orderingEnabled) {
        setNotice("الطلب أونلاين غير مفعّل حالياً.");
      }
      renderNav();
      renderMenu();
      updateCartCount();
      renderAccount();
    } catch (err) {
      var st = $("status");
      st.textContent = "تعذّر تحميل المنيو. حاول تحديث الصفحة بعد قليل.";
      st.classList.add("error");
      console.error(err);
      return;
    }

    if (client && client.auth) {
      try {
        var s = await client.auth.getSession();
        setUser(s && s.data && s.data.session ? s.data.session.user : null);
      } catch (e) { setUser(null); }
      client.auth.onAuthStateChange(function (event, session) {
        setUser(session ? session.user : null);
      });
    }
  }

  $("open-cart").addEventListener("click", function () { openDrawer("cart"); });
  $("close-cart").addEventListener("click", closeDrawer);
  $("overlay").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("cart-drawer").hidden) closeDrawer();
  });

  boot();
})();
