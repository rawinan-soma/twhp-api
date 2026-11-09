# ย้าย MinIO ไป RustFS โดยใช้ volume เดิม

Runbook สำหรับสลับ object storage บน production จาก MinIO เป็น RustFS โดยไม่ย้ายข้อมูลไป volume ใหม่

## ผลทดสอบ (2026-11-09)

ทดสอบบน laptop (arm64) ด้วย container ชั่วคราว ใช้ MinIO `RELEASE.2025-09-07T16-13-09Z` และ RustFS digest ที่ระบุในขั้นตอนที่ 4 ผ่านโค้ด `src/utils.ts` จริง

| การทดสอบ | ผล |
|---|---|
| เปลี่ยน image โดยไม่ `chown` | RustFS เปิดไม่ขึ้น: `Permission denied (os error 13)` ไฟล์ไม่เสียหาย |
| หลัง `chown`: อ่านไฟล์เดิมจาก MinIO | ผ่าน เนื้อไฟล์ตรงทุก byte |
| หลัง `chown`: อัปโหลดไฟล์ใหม่ (ถึง 70 MB และพร้อมกัน 11 ไฟล์) | ผ่าน |
| หลัง `chown`: ลบไฟล์เดิมจาก MinIO | ผ่าน |
| Hash ทุกไฟล์ก่อนและหลังสลับ (14 ไฟล์) | ตรงกัน |
| Rollback หลัง RustFS เขียนไฟล์ใหม่และลบไฟล์เดิม | ผ่าน hash ตรงกับก่อนย้าย ไฟล์ที่ถูกลบกลับมา ไฟล์ที่อัปโหลดบน RustFS หายไป (404) และ MinIO อัปโหลดกับลบไฟล์ได้ปกติ |

ยังไม่ได้ทดสอบ: การ hard reject เต็ม flow, การอัปโหลดผ่าน HTTP route จริง และการย้ายแบบ volume เดิมบน amd64 (staging ทดสอบแบบ copy volume ผ่านแล้ว)

## ก่อนเริ่ม

- ทำตอนไม่มีคนอัปโหลด ระหว่างสลับ ไฟล์จะเปิดและอัปโหลดไม่ได้ชั่วคราว
- ถ้ารุ่น MinIO ของ production ต่างจากที่ทดสอบ ให้ทดสอบกับสำเนาของ volume ก่อน
- ห้ามรัน `docker compose down -v` หรือ `docker volume prune`
- รันทุกคำสั่งใน shell เดียวกัน บน server ในโฟลเดอร์ที่มี `docker-compose.yaml`

## ขั้นตอน

**1. ตั้งค่าตัวแปร และเช็กรุ่นกับพื้นที่ดิสก์**

```bash
P=$(docker inspect twhp-minio -f '{{index .Config.Labels "com.docker.compose.project"}}')
VOL=${P}_minio_data; NET=${P}_default; EP=http://minio:9000
KEY=$(grep ^MINIO_ACCESS_KEY= docker.env | cut -d= -f2-)
SECRET=$(grep ^MINIO_SECRET_KEY= docker.env | cut -d= -f2-)
BUCKET=$(grep ^MINIO_BUCKET_NAME= docker.env | cut -d= -f2-)

rc() { docker run --rm --network $NET \
  -e RCLONE_CONFIG_S_TYPE=s3 -e RCLONE_CONFIG_S_PROVIDER=Minio \
  -e RCLONE_CONFIG_S_ACCESS_KEY_ID=$KEY -e RCLONE_CONFIG_S_SECRET_ACCESS_KEY=$SECRET \
  -e RCLONE_CONFIG_S_ENDPOINT=$EP rclone/rclone "$@"; }

docker exec twhp-minio minio --version
docker exec twhp-minio du -sh /data; df -h .
```

**2. เก็บ hash ของไฟล์ทั้งหมด และสำรอง image กับ compose**

```bash
rc hashsum SHA256 --download S:$BUCKET | sort -k2 > before.txt
wc -l before.txt     # ต้องมากกว่า 0
docker save minio/minio:latest | gzip > ~/minio-image-backup.tar.gz
cp docker-compose.yaml docker-compose.yaml.minio-backup
```

**3. หยุด MinIO สำรอง volume แล้วเปลี่ยนเจ้าของไฟล์**

```bash
docker compose stop minio
docker run --rm -v $VOL:/d -v "$PWD:/b" alpine tar czf /b/minio-data-backup.tar.gz -C /d .
docker run --rm -v $VOL:/d alpine chown -R 10001:10001 /d
```

**4. แก้ `docker-compose.yaml` เฉพาะ service `minio`**

ใส่ค่า `RUSTFS_ACCESS_KEY` และ `RUSTFS_SECRET_KEY` ให้ตรงกับ `MINIO_ACCESS_KEY` และ `MINIO_SECRET_KEY` ใน `docker.env` ส่วน `minio_data:` ด้านล่างไฟล์คงไว้เหมือนเดิม `docker.env` และ nginx ไม่ต้องแก้

```yaml
    minio:
        image: rustfs/rustfs@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2
        container_name: twhp-minio
        restart: always
        environment:
            RUSTFS_ACCESS_KEY: <ค่าเดียวกับ MINIO_ACCESS_KEY>
            RUSTFS_SECRET_KEY: <ค่าเดียวกับ MINIO_SECRET_KEY>
            RUSTFS_CONSOLE_ENABLE: "true"
        volumes:
            - minio_data:/data
        healthcheck:
            test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
            interval: 30s
            timeout: 20s
            retries: 3
```

**5. เปิด RustFS แล้ว restart nginx**

```bash
docker compose --profile production up -d --wait --no-deps minio
docker compose --profile production restart nginx-backend-prod
```

**6. เทียบ hash ของไฟล์**

```bash
rc hashsum SHA256 --download S:$BUCKET | sort -k2 > after.txt
wc -l before.txt after.txt; diff before.txt after.txt && echo IDENTICAL
```

ต้องขึ้น `IDENTICAL` และจำนวนบรรทัดต้องเท่ากันและมากกว่า 0 ถ้าไม่ตรง ให้ rollback ทันที ก่อนเปิดให้คนใช้งาน

**7. ทดสอบผ่านเว็บจริง**

เปิดไฟล์เดิม อัปโหลดไฟล์ใหม่ แล้วลบไฟล์นั้น signed link มีอายุ 5 วินาที จึงต้องเปิดทันที หน้า console ที่ `/twhp/minio-console` ใช้งานไม่ได้ตามที่คาดไว้ แต่ไม่กระทบการทำงานของระบบ

เก็บ `minio-data-backup.tar.gz` ไว้จนกว่าระบบจะใช้งานได้ปกติสักระยะ

## Rollback

ไฟล์ที่อัปโหลดหลังสลับเป็น RustFS จะหาย และไฟล์ที่ถูกลบหลังสลับจะกลับมา ขณะที่ฐานข้อมูลไม่ได้ย้อนตาม

```bash
docker compose stop minio
docker run --rm -v $VOL:/d -v "$PWD:/b" alpine sh -c 'find /d -mindepth 1 -delete && tar xzf /b/minio-data-backup.tar.gz -C /d'
cp docker-compose.yaml.minio-backup docker-compose.yaml
docker compose --profile production up -d --wait --no-deps minio
docker compose --profile production restart nginx-backend-prod
```

หลัง rollback ให้เทียบ hash กับ `before.txt` เหมือนขั้นตอนที่ 6
