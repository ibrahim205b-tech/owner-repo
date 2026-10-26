/* Customer menu page: menu rendering, cart drawer and checkout. */
(function () {
  "use strict";

  var config = window.HAJJI_CONFIG || {};
  var Cart = window.HajjiCart;
  var Data = window.HajjiData;

  var menu = null;
  var index = null;
  var cart = Cart.load();
  var orderingEnabled = Data.isConfigured(config) && !!Data.getClient(config);
  var cardState = {}; // productId -> { optionId, qty }

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

  var ERRORS = {
    PRODUCT_UNAVAILABLE: "أحد الأصناف لم يعد متوفراً. احذفه من السلة ثم أعد المحاولة.",
    OPTION_REQUIRED: "يرجى اختيار الحجم لأحد الأصناف.",
    OPTION_UNAVAILABLE: "أحد الأحجام لم يعد متوفراً. احذفه من السلة ثم أعد المحاولة.",
    INVALID_NAME: "يرجى كتابة الاسم (حرفان على الأقل).",
    INVALID_PHONE: "رقم الهاتف غير صحيح.",
    INVALID_ADDRESS: "يرجى كتابة العنوان بالتفصيل (5 أحرف على الأقل).",
    INVALID_QTY: "كمية أحد الأصناف غير صالحة.",
    INVALID_ITEMS: "السلة فارغة أو تتجاوز الحد المسموح.",
  };
  function errorText(err) {
    var msg = String((err && (err.message || err.details || err.hint)) || "");
    var codes = Object.keys(ERRORS);
    for (var i = 0; i < codes.length; i++) if (msg.indexOf(codes[i]) !== -1) return ERRORS[codes[i]];
    return "تعذّر إرسال الطلب. حاول مرة أخرى بعد قليل.";
  }

  // ---------- menu ----------
  function renderNav() {
    var list = document.getElementById("cat-list");
    list.innerHTML = "";
    index.visibleSections.forEach(function (s) {
      list.appendChild(el("li", null, [
        el("a", { href: "#sec-" + s.id, text: s.name.replace(/^قسم\s+/, "") }),
      ]));
    });
    document.getElementById("cats").hidden = false;
  }

  function productCard(p) {
    var state = cardState[p.id] || (cardState[p.id] = { optionId: p.options.length === 1 ? p.options[0].id : null, qty: 1 });
    var thumb = p.image_url
      ? el("div", { class: "thumb" }, [el("img", { src: p.image_url, alt: p.name, loading: "lazy" })])
      : el("div", { class: "thumb", text: "" });

    var priceEl = el("div", { class: "price" });
    var qtyOut = el("output", { text: String(state.qty) });
    var addBtn = el("button", { class: "btn", type: "button", disabled: !orderingEnabled }, [
      orderingEnabled ? "أضف إلى السلة" : "الطلب غير متاح حالياً",
    ]);
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
      el("div", { class: "row-price" }, [priceEl]),
      el("div", { class: "add-row" }, [stepper, addBtn]),
    ]);
  }

  function flash(btn, text) {
    var original = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = original; }, 900);
  }

  function renderMenu() {
    var root = document.getElementById("menu");
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
    var area = document.getElementById("notice-area");
    area.innerHTML = "";
    if (text) area.appendChild(el("p", { class: "notice", text: text }));
  }

  // ---------- cart ----------
  function updateCartCount() {
    document.getElementById("cart-count").textContent = String(Cart.count(cart));
  }

  function openCart() {
    document.getElementById("overlay").hidden = false;
    document.getElementById("cart-drawer").hidden = false;
    renderCart();
    document.getElementById("close-cart").focus();
  }
  function closeCart() {
    document.getElementById("overlay").hidden = true;
    document.getElementById("cart-drawer").hidden = true;
    document.getElementById("open-cart").focus();
  }

  function renderCart(successInfo) {
    var body = document.getElementById("cart-body");
    var footer = document.getElementById("cart-footer");
    body.innerHTML = "";
    footer.innerHTML = "";

    if (successInfo) {
      body.appendChild(el("div", { class: "success" }, [
        "تم استلام طلبك رقم " + successInfo.order_id + ". المجموع: " + fmt(successInfo.total_iqd) + ". الدفع عند الاستلام.",
      ]));
      if (config.whatsapp) {
        var lines = successInfo.lines.map(function (l) {
          return "- " + l.name + (l.label ? " (" + l.label + ")" : "") + " × " + l.qty;
        });
        var text = "طلب رقم " + successInfo.order_id + " من " + config.restaurantName + "\n" + lines.join("\n") +
          "\nالمجموع: " + fmt(successInfo.total_iqd);
        body.appendChild(el("p", null, [
          el("a", { class: "btn", href: "https://wa.me/" + config.whatsapp + "?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener", style: "display:inline-block;text-align:center;text-decoration:none" }, ["أرسل التفاصيل عبر واتساب"]),
        ]));
      }
      footer.appendChild(el("button", { class: "btn ghost", type: "button", onclick: closeCart }, ["متابعة التصفح"]));
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
          el("button", { class: "btn small danger", type: "button", onclick: function () { cart = Cart.remove(cart, line.key); Cart.save(cart); updateCartCount(); renderCart(); } }, ["حذف"]),
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
            el("button", { type: "button", "aria-label": "تقليل", onclick: function () { cart = Cart.setQty(cart, line.key, r.qty - 1); Cart.save(cart); updateCartCount(); renderCart(); } }, ["−"]),
            el("output", { text: String(r.qty) }),
            el("button", { type: "button", "aria-label": "زيادة", onclick: function () { cart = Cart.setQty(cart, line.key, Math.min(Cart.MAX_QTY, r.qty + 1)); Cart.save(cart); updateCartCount(); renderCart(); } }, ["+"]),
          ]),
          el("button", { class: "btn small ghost", type: "button", onclick: function () { cart = Cart.remove(cart, line.key); Cart.save(cart); updateCartCount(); renderCart(); } }, ["حذف"]),
        ]),
      ]));
    });

    var form = el("form", { class: "checkout", id: "checkout" }, [
      el("label", null, ["الاسم", el("input", { name: "name", required: true, minlength: 2, maxlength: 100, autocomplete: "name" })]),
      el("label", null, ["رقم الهاتف", el("input", { name: "phone", required: true, inputmode: "tel", autocomplete: "tel", placeholder: "07xxxxxxxxx" })]),
      el("label", null, ["العنوان", el("textarea", { name: "address", required: true, minlength: 5, maxlength: 300, autocomplete: "street-address" })]),
      el("label", null, ["ملاحظات (اختياري)", el("textarea", { name: "notes", maxlength: 500 })]),
      el("p", { class: "form-error", id: "form-error", role: "alert" }),
    ]);

    var submit = el("button", { class: "btn", type: "submit", disabled: !orderingEnabled || hasMissing }, [
      !orderingEnabled ? "الطلب غير متاح حالياً" : "إرسال الطلب",
    ]);
    form.appendChild(submit);

    body.appendChild(form);
    footer.appendChild(el("div", { class: "total-row" }, [el("span", { text: "المجموع التقريبي" }), el("strong", { text: fmt(total) })]));
    footer.appendChild(el("p", { class: "muted", style: "margin:0 0 6px;font-size:13px", text: "الدفع عند الاستلام. السعر النهائي يُحسب على الخادم عند إرسال الطلب." }));
    if (hasMissing) footer.appendChild(el("p", { class: "form-error", text: "احذف الأصناف غير المتوفرة قبل إرسال الطلب." }));

    form.addEventListener("submit", submitOrder);
  }

  async function submitOrder(ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var errorEl = document.getElementById("form-error");
    errorEl.textContent = "";
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var phone = String(fd.get("phone") || "").trim();
    var address = String(fd.get("address") || "").trim();
    var notes = String(fd.get("notes") || "").trim();

    if (name.length < 2) { errorEl.textContent = ERRORS.INVALID_NAME; return; }
    if (!/^\+?[0-9 ]{7,20}$/.test(phone)) { errorEl.textContent = ERRORS.INVALID_PHONE; return; }
    if (address.length < 5) { errorEl.textContent = ERRORS.INVALID_ADDRESS; return; }

    var submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "جارٍ إرسال الطلب...";

    var client = Data.getClient(config);
    var payload = Cart.toPayload(cart);
    var lines = cart.map(function (line) {
      var r = Cart.resolveLine(line, index);
      return { name: r ? r.name : "", label: r ? r.label : null, qty: line.qty };
    });
    try {
      var res = await client.rpc("create_order", {
        p_customer_name: name, p_phone: phone, p_address: address, p_notes: notes, p_items: payload,
      });
      if (res.error) throw res.error;
      var result = res.data;
      cart = [];
      Cart.save(cart);
      updateCartCount();
      renderCart({ order_id: result.order_id, total_iqd: result.total_iqd, lines: lines });
    } catch (err) {
      errorEl.textContent = errorText(err);
      submit.disabled = false;
      submit.textContent = "إرسال الطلب";
    }
  }

  // ---------- boot ----------
  async function boot() {
    document.title = (config.restaurantName || "المنيو") + " - المنيو";
    try {
      menu = await Data.loadMenu(config);
      index = Data.buildIndex(menu);
      document.getElementById("status").hidden = true;
      if (menu.source === "fallback") {
        setNotice("المنيو معروض كما هو في القائمة الرسمية. الطلب أونلاين سيُفعَّل بعد ربط قاعدة البيانات.");
      } else if (!orderingEnabled) {
        setNotice("الطلب أونلاين غير مفعّل حالياً.");
      }
      renderNav();
      renderMenu();
      updateCartCount();
    } catch (err) {
      var st = document.getElementById("status");
      st.textContent = "تعذّر تحميل المنيو. حاول تحديث الصفحة بعد قليل.";
      st.classList.add("error");
      console.error(err);
    }
  }

  document.getElementById("open-cart").addEventListener("click", openCart);
  document.getElementById("close-cart").addEventListener("click", closeCart);
  document.getElementById("overlay").addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !document.getElementById("cart-drawer").hidden) closeCart();
  });

  boot();
})();
