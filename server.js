const express = require('express');
const client = require('prom-client');
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

// Prometheus 메트릭 기본 설정
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });


// HTTP 요청 수를 기록하는 메트릭
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'statusCode']
});

// HTTP 요청의 메트릭을 수집
app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.route ? req.route.path : req.originalUrl,
      statusCode: res.statusCode
    });
  });
  next();
});




app.get('/', (요청, 응답) => {
  응답.render('index.ejs')
});

app.get('/list', (요청, 응답) => {
    응답.render('list.ejs')
});

app.get('/upload', (요청, 응답) => {
  응답.render('upload.ejs')
});

// 메트릭을 노출하는 엔드포인트 추가
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT} 에서 서버 실행중`);
});
