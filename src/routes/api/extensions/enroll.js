const router = require('express').Router();
const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
const fs = require('fs');
const fileType = require('file-type');
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_value';

const password = process.env.ENCRYPTION_KEY;
const pool = require('../../../db/connection'); // pool을 별도 모듈로 관리
const winston = require('winston');


// Logger 설정
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Multer storage 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
      const uploadPath = path.join(__dirname, '../../../../uploads');
      console.log('Upload path:', uploadPath);
      
      // uploads 디렉토리가 없으면 생성
      if (!fs.existsSync(uploadPath)) {
          console.log('Uploads directory does not exist. Creating it...');
          fs.mkdirSync(uploadPath, { recursive: true });
          fs.chmodSync(uploadPath, 0o777);
      }

      cb(null, uploadPath); // 업로드할 파일 저장 경로
  },
  filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeFileName = uniqueSuffix + path.extname(file.originalname);
      console.log('Safe file name:', safeFileName);
      cb(null, safeFileName); // 파일 이름을 고유하게 변경
  }
});

// console.log(process.env);

const upload = multer({ 
  storage: storage,
  limits: { filesize: 20 * 1024 * 1024 } // 파일 크기 최대 20MB까지
});


// 암호화 함수
function encrypt(buffer) {
  const iv = crypto.randomBytes(16); // Initial Vector 생성
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // hex로 변환

  console.log('Encryption Key Length:', key.length); // 키 길이를 출력

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const crypted = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  return crypted;
}

// 파일 안전 삭제 함수
function secureDelete(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        return reject(err);
      }

      const bufferSize = 4096;
      const buffer = Buffer.alloc(bufferSize, 0);
      const iterations = Math.ceil(stats.size / bufferSize);

      // 파일 내용 덮어쓰기
      const overwriteFile = (fd, iter) => {
        if (iter < iterations) {
          crypto.randomFill(buffer, (err, buf) => {
            if (err) {
              fs.close(fd, () => {
                fs.unlink(filePath, () => reject(err));
              });
            } else {
              fs.write(fd, buf, 0, bufferSize, iter * bufferSize, (err) => {
                if (err) {
                  fs.close(fd, () => {
                    fs.unlink(filePath, () => reject(err));
                  });
                } else {
                  overwriteFile(fd, iter + 1);
                }
              });
            }
          });
        } else {
          fs.close(fd, (err) => {
            if (err) {
              return reject(err);
            }
            // 파일 시스템에서 삭제
            fs.unlink(filePath, resolve);
          });
        }
      };

      fs.open(filePath, 'r+', (err, fd) => {
        if (err) {
          return reject(err);
        }
        overwriteFile(fd, 0);
      });
    });
  });
}


// 고정 확장자
router.get('/fixed', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fixed_extensions');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 고정 확장자 상태 업데이트
router.put('/fixed/:id', async (req, res) => {
  const { id } = req.params;
  const { is_checked } = req.body;
  try {
    await pool.query('UPDATE fixed_extensions SET is_checked = ? WHERE id = ?', [is_checked, id]);
    res.json({ message: 'Updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 커스텀 확장자 추가
router.post('/custom', async (req, res) => {
  const { extension } = req.body;

  // 확장자가 .으로 시작하는지 확인
  if (!extension.startsWith('.')) {
      return res.status(400).json({ error: '확장자는 점(.)으로 시작해야 합니다.' });
  }

  // 동일한 확장자가 고정 확장자 또는 이미 있는지 검사
  try {
    const [fixedExists] = await pool.query('SELECT * FROM fixed_extensions WHERE extension = ?', [extension.toLowerCase()]);
    const [customExists] = await pool.query('SELECT * FROM custom_extensions WHERE extension = ?', [extension.toLowerCase()]);
    
    if (fixedExists.length > 0 || customExists.length > 0) {
      return res.status(409).json({ error: '동일한 확장자가 존재합니다.' });
    }

    const [result] = await pool.query('INSERT INTO custom_extensions (extension) VALUES (?)', [extension]);
    res.json({ id: result.insertId, extension });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 커스텀 확장자 불러오기
router.get('/custom', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM custom_extensions ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 커스텀 확장자 삭제
router.delete('/custom/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const result = await pool.query('DELETE FROM custom_extensions WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
          res.json({ message: 'Deleted successfully' });
      } else {
          res.status(404).json({ error: '확장자를 찾을 수 없습니다.' });
      }
  } catch (error) {
      console.error('Delete custom extension error:', error);
      res.status(500).json({ error: 'Database error' });
  }
});


// 파일 업로드
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
      logger.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
  }

  logger.info(`Upload attempt for file: ${file.originalname}`);

  // 파일의 실제 MIME 타입을 읽기
  const buffer = fs.readFileSync(file.path);
  let fileTypeResult;
  try {
      fileTypeResult = await fileType.fromBuffer(buffer);
  } catch (fileTypeError) {
      logger.error('Error determining file type:', fileTypeError);
      console.error('File type determination error:', fileTypeError);
      return res.status(500).json({ error: 'File type detection error' });
  }

  logger.info(`Detected MIME type: ${fileTypeResult?.mime}`);
  logger.info(`Detected file extension: ${fileTypeResult?.ext}`);
  logger.info(`Original file extension: ${path.extname(file.originalname).toLowerCase()}`);

  if (!fileTypeResult || path.extname(file.originalname).toLowerCase() !== `.${fileTypeResult.ext}`) {
      logger.error('File type mismatch');
      await secureDelete(file.path);
      return res.status(400).json({ error: '파일 확장자와 MIME 타입이 일치하지 않습니다.' });
  }

  try {
      const [fixedExtensionsRows] = await pool.query('SELECT * FROM fixed_extensions WHERE is_checked = true');
      const [customExtensionsRows] = await pool.query('SELECT * FROM custom_extensions');
      
      const disallowedExtensions = [
          ...fixedExtensionsRows.map(ext => ext.extension.toLowerCase()),
          ...customExtensionsRows.map(ext => ext.extension.toLowerCase())
      ];

      if (disallowedExtensions.includes(`.${fileTypeResult.ext}`)) {
          logger.warn(`Blocked extension upload attempt: ${fileTypeResult.ext}`);
          await secureDelete(file.path);
          return res.status(400).json({ error: '차단된 확장자 파일입니다. 업로드할 수 없습니다.' });
      }

      // 파일 암호화 및 저장하기 전에 쓰기 권한 확인
      const encryptedPath = path.resolve(__dirname, '../../../../uploads');

      try {
          // 먼저 경로가 존재하지 않는 경우 생성
          if (!fs.existsSync(encryptedPath)) {
              fs.mkdirSync(encryptedPath, { recursive: true });
              fs.chmodSync(encryptedPath, 0o777);
          }

          // 경로에 대한 쓰기 권한 확인
          fs.accessSync(encryptedPath, fs.constants.W_OK);

          // 파일 암호화 및 저장
          const encryptedData = encrypt(buffer);
          fs.writeFileSync(`${encryptedPath}/${file.filename}`, encryptedData);
          logger.info(`File uploaded and encrypted: ${file.filename}`);
          res.json({ message: '파일이 성공적으로 업로드되었습니다.' });

      } catch (err) {
          if (err.code === 'EACCES') {
              logger.error('Write permission denied for path:', encryptedPath);
              console.error('Write permission denied:', err);
              return res.status(500).json({ error: 'Write permission denied' });
          } else {
              logger.error('Error during file encryption or saving:', err);
              console.error('Encryption error:', err);
              await secureDelete(file.path);
              return res.status(500).json({ error: 'File encryption or saving error' });
          }
      }

  } catch (error) {
      logger.error('Unexpected error during file processing:', error.stack);
      console.error('Unexpected error:', error);
      await secureDelete(file.path);
      return res.status(500).json({ error: 'File upload validation error' });
  }
});



module.exports = router;
