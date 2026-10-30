"""Read-only settings discovery. Does not assume indices are setting IDs."""
import asyncio,json,sys
from pathlib import Path
from meta_neural_py import Band
from meta_neural_py.protocol.protobuf import Fields,field

def describe(f):
    return {str(n):[v if isinstance(v,int) else {'hex':v.hex(),'text':v.decode('utf-8',errors='replace')} for w,v in vals] for n,vals in f.values.items()}
async def main():
    results=[]
    async with Band(sys.argv[1]) as band:
        reply=Fields(await band._rpc('settings_count',1,14,field(1,field(1,2))))
        count=Fields(Fields(reply.bytes(14)).bytes(1)).integer(1)
        print(json.dumps({'count':count}),flush=True)
        if not 0<count<256: raise ValueError('Unexpected settings count')
        for index in range(count):
            reply=Fields(await band._rpc('settings_describe',1,14,field(2,field(1,2)+field(2,index))))
            info=Fields(Fields(reply.bytes(14)).bytes(2))
            row={'index':index,'descriptor':describe(info)}
            ident=info.integer(4)
            reply=Fields(await band._rpc('settings_read',1,14,field(3,field(1,ident)+field(2,0))))
            value=Fields(Fields(reply.bytes(14)).bytes(3))
            row['value']=describe(value)
            results.append(row)
            print(json.dumps(row),flush=True)
            Path(sys.argv[2]).write_text(json.dumps({'count':count,'settings':results},indent=2))
asyncio.run(main())
