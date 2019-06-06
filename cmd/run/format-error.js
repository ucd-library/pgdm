module.exports = e => {
  return`
ERROR:
${e.message}

DETAILS:
${e.detail || 'NA'}

STACK TRACE:
${e.where || 'NA'}
`};