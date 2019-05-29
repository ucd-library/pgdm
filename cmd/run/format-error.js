module.exports = e => {
  if( !e.originalError ) e.originalError = {};
  return`
ERROR:
${e.message}

DETAILS:
${e.originalError.detail || 'NA'}

STACK TRACE:
${e.originalError.where || 'NA'}
`};