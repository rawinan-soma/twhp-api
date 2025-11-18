import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'prisma/prisma.service';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AuthenticationModule } from './authentication.module';

describe('AuthenticationController', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthenticationModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);

    await prisma.accounts.deleteMany();
    await prisma.accounts.create({
      data: {
        username: 'doed01',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'doed01@mail.com',
        role: 'DOED',
        adminDoed: {
          create: {
            first_name: 'Doed',
            last_name: 'Doed',
            phone_number: '12345678',
          },
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.accounts.deleteMany();
  });

  it('should succesful login with correct password', async () => {
    return await request(app.getHttpServer())
      .post('/authentication/login')
      .send({ username: 'doed01', password: '12345' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('message', 'login succesful');
      })
      .expect((res) => {
        expect(res.headers['set-cookie']).toBeDefined();
      });
  });

  it('should fail login with incorrect password', async () => {
    return await request(app.getHttpServer())
      .post('/authentication/login')
      .send({ username: 'doed01', password: 'wrongpassword' })
      .expect(401)
      .expect((res) => {
        expect(res.body).toHaveProperty('error', 'Unauthorized');
      });
  });

  it('should login before logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/authentication/login')
      .send({ username: 'doed01', password: '12345' })
      .expect(200);

    const cookie = loginRes.headers['set-cookie'];

    return await request(app.getHttpServer())
      .post('/authentication/logout')
      .set('Cookie', cookie)
      .expect(200);
  });
});
