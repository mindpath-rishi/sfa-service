import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RoleSeeder } from './role.seed';
import { SuperAdminSeeder } from './super-admin.seeds';
import { PermissionsSeeder } from './permission.seeds';
import { RolePermissionsSeeder } from './role-permissions.seed';

@Injectable()
export class SeederRunner {
  private readonly logger = new Logger(SeederRunner.name);

  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    private readonly roleSeeder: RoleSeeder,
    private readonly superAdminSeeder: SuperAdminSeeder,
    private readonly permissionSeeder: PermissionsSeeder,
    private readonly rolePermissionsSeeder: RolePermissionsSeeder,
  ) {}

  async run() {
    await this.waitForCollections();

    // Each step runs on its own: one failing seeder (e.g. a Super Admin
    // login clash) must not stop permissions from being seeded.
    await this.step('super admin', async () => {
      const { superAdminRoleId } = await this.roleSeeder.seed();
      await this.superAdminSeeder.seed(superAdminRoleId);
    });
    await this.step('permissions', () => this.permissionSeeder.seed());
    await this.step('role permissions', () =>
      this.rolePermissionsSeeder.seed(),
    );
  }

  private async step(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `Seeding "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * On a fresh database Mongoose creates collections and indexes in the
   * background; a transaction that starts before that finishes fails with
   * "pending collection catalog changes". Wait for every model first.
   */
  private async waitForCollections() {
    const models = Object.values(this.connection.models);
    const results = await Promise.allSettled(
      models.map((model) => model.init()),
    );

    // Index build conflicts are normally only emitted in the background;
    // they must not block startup, so report them and continue.
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `${models[index].modelName} index sync: ${
            result.reason?.message ?? result.reason
          }`,
        );
      }
    });
  }
}
