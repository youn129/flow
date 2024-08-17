# flow
마드라스 체크 과제 
**확장자 차단 기능 구현

![텍스트](src/public/img/myTest.png)

@파일 확장자 차단

exe, sh 와 같이 실행파일이 존재하는 경우 첨부시 보안에 문제가 생길 수 있다. 이러한 것을 방지하기 위해 파일 확장자 차단을 하자.

### 1. 고정 확장자 관리
- **고정확장자 리스트:** 자주 차단되는 확장자들은 리스트 형태로 있음. default 값은 unCheck 로 설정.
- **상태 유지:** 고정확장자를 체크하거나 체크 해제할 경우, 해당 상태가 DB(MySQL)에 저장되어 새로고침 후에도 유지.

### 2. 커스텀 확장자 관리
- **확장자 입력 제한:** 커스텀 확장자는 최대 20자리까지 입력 가능.
- **중복 방지:** 이미 등록된 확장자는 중복으로 등록되지 않도록 방지.
- **최대 개수 제한:** 커스텀 확장자는 최대 200개까지 추가할 수 있음.
- **확장자 삭제:** 등록된 커스텀 확장자는 목록에서 삭제할 수 있고 삭제 시 즉시 DB에 반영.

### 3. 파일 업로드
- **차단된 확장자 파일:** 차단된 확장자 파일은 업로드가 제한됨.
- **파일 암호화:** 정보 유출 방지 목적으로 업로드된 파일은 서버에 저장되기 전에 알고리즘을 사용하여 암호화됨(AES-256-CTR).
- **MIME 타입 검증:** 파일 업로드 시, 클라이언트에서 전송된 확장자와 서버에서 검증한 실제 MIME 타입이 일치하는지 확인하여 일치하면 저장, 일치하지 않으면 저장 실패.



고정 확장자와 커스텀 확장자의 클래스 다이어그램


고정 확장자
+-------------------+
| FixedExtension    |
+-------------------+
|- id: int          |
|- extension: string|    
|- isChecked: bool  |
+-------------------+

차단할 파일 확장자의 문자열을 저장. 이 확장자는 default가 unCheck 상태여야하므로 boolean 타입으로 기본값 False 부여. 



커스텀 확장자
+-------------------+
| CustomExtension   |
+-------------------+
|- id: int          |
|- extension: string|
|- createdAt: Date  |
+-------------------+

사용자가 직접 추가한 커스텀 파일 확장자를 저장. 확장자가 언제 추가되었는지를 기록하기 위해 created_at 필드를 TIMESTAMP로 설정.



## 설치 및 실행 방법

1. git clone:
    
    bash

    git clone https://github.com/yourusername/yourprojectname.git
    cd yourprojectname
    

2. npm 설치:
    
    bash
    
    npm install
    

3. 환경 변수 파일 설정

    '.env' 파일 설정
    
    .env:

      DB_HOST=your_database_host
      DB_USER=your_database_user
      DB_PASSWORD=your_database_password
      DB_NAME=your_database_name
      ENCRYPTION_KEY=your_encryption_key
      PORT=your_server_port
      ```

4. 서버 실행
    
    bash
    
    npm start
    

5. 브라우저에서 'http://localhost:PORT' 로 접속