require('dotenv').config();

const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fileType = require('file-type');
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
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
        cb(null, 'uploads/'); // 업로드할 파일 저장 경로
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeFileName = uniqueSuffix + path.extname(file.originalname);
        cb(null, safeFileName); // 파일 이름을 고유하게 변경
    }
});

const upload = multer({ 
  storage: storage,
  limits: { filesize: 20 * 1024 * 1024 } // 파일 크기 최대 20MB까지
});


// 암호화 함수
function encrypt(buffer) {
  const cipher = crypto.createCipher(algorithm, password);
  const crypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
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
    const fileTypeResult = await fileType.fromBuffer(buffer); 

    // MIME 타입과 파일 확장자 비교
    if (!fileTypeResult || path.extname(file.originalname).toLowerCase() !== `.${fileTypeResult.ext}`) {
      logger.error('File type mismatch');
      await secureDelete(file.path); // 업로드된 파일 안전 삭제
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
            await secureDelete(file.path); // 업로드된 파일 안전 삭제
            return res.status(400).json({ error: '차단된 확장자 파일입니다. 업로드할 수 없습니다.' });
        }
        // 파일 암호화 및 저장
        const encryptedData = encrypt(buffer);
        fs.writeFileSync(`encrypted_uploads/${file.filename}`, encryptedData);
        logger.info(`File uploaded and encrypted: ${file.filename}`);
        res.json({ message: '파일이 성공적으로 업로드되었습니다.' });
    } catch (error) {
        logger.error('Error during file upload', { error: error.message });
        await secureDelete(file.path); // 업로드된 파일 안전 삭제
        res.status(500).json({ error: 'File upload validation error' });
    }
});




module.exports = router;
