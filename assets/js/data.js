/* Menu data access.
 * When Supabase is configured, the menu is read from the database.
 * Otherwise the site shows the built-in copy of the official menu (menu-data.js),
 * and ordering stays disabled because orders must be verified on the server. */
(function (root) {
  "use strict";

  var clientCache = null;

  function isConfigured(config) {
    return !!(config && config.supabaseUrl && config.supabaseAnonKey);
  }

  function getClient(config) {
    if (!isConfigured(config)) return null;
    if (!root.supabase || !root.supabase.createClient) return null;
    if (!clientCache) {
      clientCache = root.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return clientCache;
  }

  function normalizeOptions(list) {
    return (list || [])
      .filter(function (o) { return o.is_active !== false; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
      .map(function (o) { return { id: o.id, label: o.label, price: o.price }; });
  }

  async function loadFromDatabase(client) {
    var sectionsRes = await client.from("sections")
      .select("id,name,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (sectionsRes.error) throw sectionsRes.error;

    var productsRes = await client.from("products")
      .select("id,section_id,name,description,image_url,base_price,sort_order,is_active,product_options(id,label,price,sort_order,is_active)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (productsRes.error) throw productsRes.error;

    return {
      source: "database",
      sections: sectionsRes.data,
      products: productsRes.data.map(function (p) {
        return {
          id: p.id,
          section_id: p.section_id,
          name: p.name,
          description: p.description,
          image_url: p.image_url,
          base_price: p.base_price,
          options: normalizeOptions(p.product_options),
        };
      }),
    };
  }

  function loadFallback() {
    var data = root.HAJJI_MENU_FALLBACK;
    if (!data) throw new Error("menu data missing");
    return {
      source: "fallback",
      sections: data.sections.map(function (s) { return { id: s.id, name: s.name, sort_order: s.sort }; }),
      products: data.products.map(function (p) {
        return {
          id: p.id, section_id: p.section_id, name: p.name, description: null, image_url: null,
          base_price: p.base_price, options: p.options.map(function (o) { return { id: o.id, label: o.label, price: o.price }; }),
        };
      }),
    };
  }

  async function loadMenu(config) {
    var client = getClient(config);
    if (!client) return loadFallback();
    try {
      return await loadFromDatabase(client);
    } catch (err) {
      // The database is unreachable or not set up yet: show the built-in menu
      // so visitors never see an empty page. Ordering stays disabled because
      // the app will not be able to verify orders without the database.
      console.error("Menu from database failed, showing built-in menu:", err);
      return loadFallback();
    }
  }

  // Lookup tables used by the page and the cart.
  function buildIndex(menu) {
    var sectionsById = {};
    menu.sections.forEach(function (s) { sectionsById[s.id] = s; });
    var productsById = {};
    var productsBySection = {};
    menu.products.forEach(function (p) {
      productsById[p.id] = p;
      if (!productsBySection[p.section_id]) productsBySection[p.section_id] = [];
      productsBySection[p.section_id].push(p);
    });
    var visibleSections = menu.sections.filter(function (s) { return (productsBySection[s.id] || []).length > 0; });
    return { sectionsById: sectionsById, productsById: productsById, productsBySection: productsBySection, visibleSections: visibleSections };
  }

  root.HajjiData = {
    isConfigured: isConfigured,
    getClient: getClient,
    loadMenu: loadMenu,
    buildIndex: buildIndex,
  };
})(window);
