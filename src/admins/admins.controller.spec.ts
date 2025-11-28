/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsModule } from './admins.module';
import request from 'supertest';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import cookieParser from 'cookie-parser';
import TestAgent from 'supertest/lib/agent';

describe('Admins', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AdminsModule, AuthenticationModule],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);

    agent = request.agent(app.getHttpServer());

    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
    await prisma.enrolls.deleteMany();
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

    // const factoryId = (await prisma.accounts.findFirst({
    //   where: { factory: { name_th: 'โรงงานลำไย' } },
    // }))!.id;

    // await prisma.enrolls.create({
    //   data: { factory: { connect: { account_id: factoryId } } },
    // });

    await agent
      .post('/authentication/login')
      .send({ username: 'doed01', password: '12345' })
      .expect(200);
  });

  afterEach(async () => {
    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
    // await agent.post('/authentication/logout').expect(200);
  });

  it('should update own data', async () => {
    await agent
      .patch(`/admins`)
      .send({
        first_name: 'กองโรค',
        last_name: 'กองโรค',
        phone_number: '0987654321',
        email: 'doed_examplemail@mail.go.th',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          first_name: 'กองโรค',
          last_name: 'กองโรค',
          phone_number: '0987654321',
          email: 'doed_examplemail@mail.go.th',
        });
      });

    expect(
      await prisma.adminsDoed.findFirst({
        where: { account: { username: 'doed01' } },
      }),
    ).toMatchObject({
      first_name: 'กองโรค',
      last_name: 'กองโรค',
    });
    expect(
      await prisma.accounts.findUnique({
        where: { username: 'doed01' },
      }),
    ).toMatchObject({
      email: 'doed_examplemail@mail.go.th',
    });
  });

  it('should validate registered factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });

    expect(
      await prisma.factories.findUnique({ where: { account_id: factory!.id } }),
    ).toHaveProperty('is_validate', true);
  });

  it('should delete unwanted factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: {
        username: 'factory1',
      },
    });

    await agent
      .delete(`/admins/factory/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          message: 'factory deleted successfully',
        });
      });

    await agent
      .get(`/admins/factory?factory_id=${factory!.id}`)
      .expect(400)
      .expect((res) => {
        expect(res.body).toHaveProperty('message', 'factory not found');
      });

    expect(
      await prisma.factories.findUnique({ where: { account_id: factory!.id } }),
    ).toBeNull();
  });

  it('should retrun array of all un-validated factories', async () => {
    await agent
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

  it('should return array of all validated factories', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });

    await agent
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

  it('should get one factory by id', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .get(`/admins/factory?factory_id=${factory?.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Object);
        expect(res.body).toHaveProperty('name_th');
        expect(res.body).toHaveProperty('username');
        expect(res.body).not.toHaveProperty('account');
      });
  });

  it('should not access if current user is not DOED', async () => {
    await agent.post('/authentication/logout').expect(200);

    await agent
      .post('/authentication/login')
      .send({ username: 'factory1', password: '12345' });

    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent.get(`/admins/factory?factory_id=${factory?.id}`).expect(403);
  });

  it('should update password and use new password to login', async () => {
    await agent
      .patch(`/admins`)
      .send({
        password: 'newPassword',
      })
      .expect(200);

    await agent
      .post('/authentication/login')
      .send({ username: 'doed01', password: 'newPassword' })
      .expect(200);

    await agent
      .get('/authentication')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('username', 'doed01');
      });

    await agent.post('/authentication/logout').expect(200);
  });

  it('should edit factory data by account id', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/${factory?.id}`)
      .send({
        name_th: 'โรงงานเกลือ',
      })
      .expect(200);

    await agent
      .get(`/admins/factory?factory_id=${factory?.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Object);
        expect(res.body).toHaveProperty('name_th', 'โรงงานเกลือ');
        expect(res.body).toHaveProperty('username');
        expect(res.body).not.toHaveProperty('account');
      });
  });

  it('should get all enrolls data', async () => {});
});
