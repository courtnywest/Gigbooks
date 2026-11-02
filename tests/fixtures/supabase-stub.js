// A stand-in for supabase-js used by the tests. It serves rows from
// window.__FIXTURE (set by tests/helpers.js) instead of a real database.
(function(){
  const F = window.__FIXTURE || {};
  const tables = F.tables || {};
  const user = Object.assign({ id:"11111111-2222-3333-4444-555555555555", email:"creator@example.com",
    user_metadata:{ full_name:"Test Creator" }, created_at:"2025-01-01T00:00:00Z" }, F.user || {});
  const ok = (data) => Promise.resolve({ data: data === undefined ? {} : data, error:null });

  function query(table){
    let rows = (tables[table] || []).slice();
    let inserted = null;
    const missing = F.missingTables && F.missingTables.includes(table);
    const result = () => missing ? { data:null, error:{ message:`relation "${table}" does not exist` } } : { data:rows, error:null };
    const chain = new Proxy(function(){}, {
      get(_, k){
        if(k === "then"){ const p = Promise.resolve(result()); return p.then.bind(p); }
        if(k === "maybeSingle" || k === "single") return () => Promise.resolve(missing ? result() : { data: inserted || rows[0] || null, error:null });
        if(k === "insert") return (row) => { inserted = Object.assign({ id:"row-" + Math.random().toString(36).slice(2) }, Array.isArray(row) ? row[0] : row); return chain; };
        if(k === "update") return (patch) => { inserted = Object.assign({}, rows[0] || {}, patch); return chain; };
        return () => chain;
      }
    });
    return chain;
  }

  window.supabase = { createClient(){ return {
    from: query,
    rpc: (name) => Promise.resolve((F.rpc && name in F.rpc) ? { data:F.rpc[name], error:null } : { data:null, error:{ message:"function not found" } }),
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
    storage: { from: () => ({ upload: ok, createSignedUrl: () => ok({ signedUrl:"about:blank" }), getPublicUrl: () => ({ data:{ publicUrl:"" } }) }) },
    functions: { invoke: (name) => Promise.resolve((F.functions && name in F.functions) ? { data:F.functions[name], error:null } : { data:null, error:{ context:{ status:404 } } }) },
    auth: {
      getSession: () => ok({ session: F.loggedOut ? null : { user } }),
      getUser: () => ok({ user }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => ok({ currentLevel:"aal1", nextLevel:"aal1" }), listFactors: () => ok({ totp:[], all:[] }) },
      signOut: ok, signInWithPassword: ok, signUp: ok, resetPasswordForEmail: ok, updateUser: ok
    }
  }; } };
})();
