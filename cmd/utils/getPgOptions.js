module.exports = cmd => {
  let pgArgs = {};
  for( let key in cmd ) {
    if( key.match(/^pg/) ) {
      pgArgs[key.replace(/^pg/, '').toLowerCase()] = cmd[key];
    }
  }
  return pgArgs;
}