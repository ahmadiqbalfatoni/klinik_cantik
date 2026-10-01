import axios from 'axios';

async function testNav() {
  try {
    const res = await axios.post('http://127.0.0.1:8000/api/v1/setup/nav/user-data', {
      user_code: 'USR000000'
    });
    console.log("Nav response status:", res.status);
    console.log("Nav data:", res.data);
  } catch (err) {
    console.error("Nav error status:", err.response?.status);
    console.error("Nav error data:", err.response?.data);
    console.error("Full error message:", err.message);
  }
}

testNav();
