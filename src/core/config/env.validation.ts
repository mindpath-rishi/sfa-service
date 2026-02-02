import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),

  PORT: Joi.number().default(3000),

  /* ---------------- DATABASE ---------------- */
  MONGO_URI: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  /* ---------------- AUTH ---------------- */
  JWT_SECRET: Joi.string().min(16).required(),

  /* ---------------- OBSERVABILITY ---------------- */
  ENABLE_PROMETHEUS: Joi.boolean().default(true),
  ENABLE_GRAFANA: Joi.boolean().default(true),

  /* ---------------- ROUTES ---------------- */
  ENABLE_METRICS_ROUTE: Joi.boolean().default(true),
  ENABLE_HEALTH_ROUTE: Joi.boolean().default(true),
});
