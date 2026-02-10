module.exports = ({ Entity }) => `
export enum ${Entity}Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
`;
