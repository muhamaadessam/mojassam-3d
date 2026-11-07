process.env.HOSTNAME = '127.0.0.1';
import('./server.js').catch((error) => { console.error(error); process.exit(1); });
