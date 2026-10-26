/* Order helpers shared by the customer site: validation, error text, status labels and messages. */
(function (root) {
  "use strict";

  // Iraq bounds used by the database check. Keep these in sync with schema.sql.
  var BOUNDS = { latMin: 29, latMax: 38, lngMin: 38, lngMax: 49.5 };

  var ERRORS = {
    LOGIN_REQUIRED: "سجّل الدخول بحساب Gmail أولاً.",
    INVALID_NAME: "يرجى كتابة الاسم (حرفان على الأقل).",
    INVALID_PHONE: "رقم الهاتف غير صحيح.",
    INVALID_LOCATION: "حدد موقعك على الخريطة قبل إرسال الطلب.",
    INVALID_LANDMARK: "اكتب أقرب نقطة دالة عليك (3 أحرف على الأقل).",
    INVALID_ITEMS: "السلة فارغة أو تتجاوز الحد المسموح.",
    INVALID_QTY: "كمية أحد الأصناف غير صالحة.",
    PRODUCT_UNAVAILABLE: "أحد الأصناف لم يعد متوفراً. احذفه من السلة ثم أعد المحاولة.",
    OPTION_REQUIRED: "يرجى اختيار الحجم لأحد الأصناف.",
    OPTION_UNAVAILABLE: "أحد الأحجام لم يعد متوفراً. احذفه من السلة ثم أعد المحاولة.",
    TOO_MANY_OPEN_ORDERS: "لديك طلبات مفتوحة كثيرة الآن. انتظر رد المطعم على طلباتك أولاً.",
  };

  function validateForm(f) {
    if (!f.name || f.name.trim().length < 2) return ERRORS.INVALID_NAME;
    if (!/^\+?[0-9 ]{7,20}$/.test(f.phone || "")) return ERRORS.INVALID_PHONE;
    if (f.lat == null || f.lng == null ||
        f.lat < BOUNDS.latMin || f.lat > BOUNDS.latMax ||
        f.lng < BOUNDS.lngMin || f.lng > BOUNDS.lngMax) return ERRORS.INVALID_LOCATION;
    if (!f.landmark || f.landmark.trim().length < 3) return ERRORS.INVALID_LANDMARK;
    return null;
  }

  function errorText(err) {
    var msg = String((err && (err.message || err.details || err.hint)) || "");
    var codes = Object.keys(ERRORS);
    for (var i = 0; i < codes.length; i++) {
      if (msg.indexOf(codes[i]) !== -1) return ERRORS[codes[i]];
    }
    return "تعذّر إرسال الطلب. حاول مرة أخرى بعد قليل.";
  }

  var LABELS = {
    pending: "بانتظار رد المطعم",
    accepted: "تم القبول",
    preparing: "قيد التحضير",
    delivered: "تم التسليم",
    rejected: "مرفوض",
    cancelled: "ملغي",
  };
  function statusLabel(status) {
    return LABELS[status] || status;
  }

  // The message the customer sees when the status changes.
  function statusMessage(order) {
    if (!order || !order.status) return null;
    switch (order.status) {
      case "accepted":
        return "المطعم استلم طلبك وراح يجهزه لك بكل حب";
      case "rejected":
        var reason = order.reject_reason ? " — " + order.reject_reason : "";
        return "عذراً، لم نتمكن من قبول طلبك" + reason;
      case "preparing":
        return "طلبك قيد التحضير الآن";
      case "delivered":
        return "تم تسليم طلبك. نتمنى لك وجبة هنية";
      case "cancelled":
        return "تم إلغاء طلبك";
      default:
        return null;
    }
  }

  var api = {
    BOUNDS: BOUNDS,
    ERRORS: ERRORS,
    validateForm: validateForm,
    errorText: errorText,
    statusLabel: statusLabel,
    statusMessage: statusMessage,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HajjiOrder = api;
})(typeof window !== "undefined" ? window : globalThis);
