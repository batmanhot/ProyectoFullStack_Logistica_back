INSERT INTO "platform_admins" ("id","email","passwordHash","nombre","activo","createdAt")
VALUES (gen_random_uuid()::text, 'admin@stockpro.dev', '$2b$12$TrrNH9gONbdxQoXpkLdb0eiMs0bjFh4sm7t2hJ8Y8i4mPwFB6ex9K', 'Super Admin StockPro', true, now())
ON CONFLICT ("email") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "activo" = true;
