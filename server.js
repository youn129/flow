const express = require('express');
const app = express();
const path = require('path');
const extensionRoutes = require('./src/routes/api/extensions/enroll');

require('dotenv').config();

app.use(express.static(path.join(__dirname, 'src/public')));
app.set('view engine', 'ejs'); 
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.json());

app.use('/api/extensions', extensionRoutes);

const PORT = process.env.PORT;

app.get('/', (요청, 응답) => {
  응답.render('index.ejs')
});

app.get('/list', (요청, 응답) => {
    응답.render('list.ejs')
});

app.get('/upload', (요청, 응답) => {
  응답.render('upload.ejs')
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT} 에서 서버 실행중`);
});
