/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsModule } from './admins.module';
import request from 'supertest';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import cookieParser from 'cookie-parser';

describe('Admins', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AdminsModule, AuthenticationModule],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);

    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
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
    await prisma.accounts.create({
      data: {
        username: 'factory1',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'factory1@mail.com',
        role: 'Factory',
        factory: {
          create: {
            factory_type: 1,
            name_th: 'โรงงานลำไย',
            name_en: 'Factory Lamai',
            tsic_code: '889900',
            address_no: '123/456',
            road: 'ถนนลำไย',
            soi: 'ซอยลำไย 8',
            zipcode: '25000',
            phone_number: '099999999',
            fax_number: '099999998',
            province_id: 25,
            district_id: 2501,
            subdistrict_id: 250101,
          },
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
  });

  it('should update own data', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    const cookie = loginResponse.headers['set-cookie'];

    return await request(app.getHttpServer())
      .patch(`/admins/${loginResponse.body.user.id}`)
      .set('Cookie', cookie)
      .send({
        first_name: 'กองโรค',
        last_name: 'กองโรค',
        phone_number: '0987654321',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          first_name: 'กองโรค',
          last_name: 'กองโรค',
          phone_number: '0987654321',
        });
      });
  });

  it('should validate registered factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    return await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });
  });

  it('should delete unwanted factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: {
        username: 'factory1',
      },
    });

    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    await agent
      .delete(`/admins/factory/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          message: 'factory deleted successfully',
        });
      });
  });

  it('should retrun array of all un-validated factories', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    return await agent
      .get('/admins/factories?validated=false')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('account_id');
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('province_id');
        expect(res.body[0]).toHaveProperty('is_validate', false);
      });
  });

  it('should retrun array of all validated factories', async () => {
    const agent = request.agent(app.getHttpServer());
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });

    return await agent
      .get('/admins/factories?validated=true')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('account_id');
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('province_id');
        expect(res.body[0]).toHaveProperty('is_validate', true);
      });
  });
});
