import {Store,createPlatformServer} from '../server/platform.mjs';
import {OracleStore} from '../server/oracle-store.mjs';
import {ociConfig} from '../server/oci-validation.mjs';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer between 1 and 65535.');
const storage=process.env.UCO_STORAGE||'file';
const store=storage==='oracle'
 ? await new OracleStore(process.env).init()
 : storage==='file'
  ? await new Store(process.env.UCO_STATE_DIR||'runtime').init()
  : (()=>{throw Error('UCO_STORAGE must be "file" or "oracle".')})();
const server=createPlatformServer({store});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Set PORT in .env to another port or stop the existing server.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`UCO Credit Intelligence: http://localhost:${port}`);console.log(`Storage: ${storage==='oracle'?'Oracle Autonomous Database':'local runtime/state.json'}`);console.log('OCI validation: '+ociConfig().status);});
