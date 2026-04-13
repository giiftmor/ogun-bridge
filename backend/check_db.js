import pg from pg;
const pool = new pg.Pool({host:192.168.0.200,port:5432,user:ghost,password:Kali@1403});
try {
  const r = await pool.query(SELECT datname FROM pg_database);
  console.log(Databases:, r.rows.map(x=>x.datname));
} catch(e) {
  console.log(Error:, e.message);
}
await pool.end();
