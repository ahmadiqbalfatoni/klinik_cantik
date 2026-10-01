import DB from '../../core/config/knex.js';

async function checkNav() {
  try {
    const userNavs = await DB('user_navigation').select('id', 'user_code').limit(10);
    console.log("User navigation rows:", userNavs);

    const usr00 = await DB('user_navigation').where('user_code', 'USR000000').first();
    console.log("USR000000 exists?", !!usr00);
    if (usr00) {
      console.log("USR000000 menu parsed successfully?", typeof JSON.parse(usr00.menu));
    }
  } catch (err) {
    console.error("DB check error:", err);
  }
  process.exit(0);
}

checkNav();
