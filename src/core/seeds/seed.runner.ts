import { Injectable, Logger } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { RoleSeeder } from "./role.seed";
import { SuperAdminSeeder } from "./super-admin.seeds";
import { PermissionsSeeder } from "./permission.seeds";

@Injectable()
export class SeederRunner {
  private readonly logger = new Logger(SeederRunner.name);

  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    private readonly roleSeeder: RoleSeeder,
    private readonly superAdminSeeder: SuperAdminSeeder,
    private readonly permissionSeeder: PermissionsSeeder,
  ) {}

  async run() {
    await this.waitForCollections();

    const { superAdminRoleId } = await this.roleSeeder.seed();
    await this.superAdminSeeder.seed(superAdminRoleId);
    await this.permissionSeeder.seed();
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
      if (result.status === "rejected") {
        this.logger.warn(
          `${models[index].modelName} index sync: ${
            result.reason?.message ?? result.reason
          }`,
        );
      }
    });
  }
}
