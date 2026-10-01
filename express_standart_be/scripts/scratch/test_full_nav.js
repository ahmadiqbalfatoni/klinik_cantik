import axios from 'axios';
import { SignJWT } from 'jose';

async function testFull() {
  const secret = new TextEncoder().encode('random');
  const token = await new SignJWT({ user_code: 'USR000000', username: 'manajer@klinik.com', role: 'manager' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);

  try {
    const res = await axios.post('http://127.0.0.1:8000/api/v1/setup/nav/user-data', {
      user_code: 'USR000000'
    }, {
      headers: {
        'X-Timestamp': new Date().toISOString(),
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log("Success! Status:", res.status);
    console.log("Data length:", res.data?.data?.length);
  } catch (err) {
    console.error("Error status:", err.response?.status);
    console.error("Error data:", err.response?.data);
  }

  process.exit(0);
}

testFull();
