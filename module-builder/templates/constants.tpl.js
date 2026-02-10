module.exports = ({ ENTITY, Entity }) => `
export const ${ENTITY} = {
  CREATED: '${Entity} created successfully',
  FETCHED: '${Entity} fetched successfully',
  UPDATED: '${Entity} updated successfully',
  DELETED: '${Entity} deleted successfully',
  NOT_FOUND: '${Entity} not found',
  DUPLICATE: '${Entity} already exists',
};
`;
