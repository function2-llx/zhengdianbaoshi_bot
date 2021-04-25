const fs = require('fs');
const axios = require('axios');
function getHour() {
    let date = new Date();
    //              origin time zone -> UTC                     -> Beijing(UTC+8)
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset() + 8 * 60);
}

let token = fs.readFileSync('token').toString().trim();
let API = `https://api.telegram.org/bot${token}h`;

function testAPI() {
    let url = `${API}/getMe`
    axios.get(url).then(res => {
        console.log(res.data);
    }).catch(err => {
        console.log(err.response.data);
    });
}

testAPI();
