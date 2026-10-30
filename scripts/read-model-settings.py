"""Read and validate model setting names/values; performs no setting writes."""
import asyncio
import json
import sys
from meta_neural_py import Band
from meta_neural_py.protocol.protobuf import Fields,field
async def main():
    async with Band(sys.argv[1]) as band:
        for ident,name in [(27,'data-collection'),(28,'data-collection-model')]:
            body=field(2,field(1,2)+field(2,ident))
            reply=Fields(await band._rpc('describe_model_setting',1,14,body))
            info=Fields(Fields(reply.bytes(14)).bytes(2))
            actual=info.bytes(3).decode()
            print(json.dumps({'requested_id':ident,'reported_name':actual,'descriptor':{str(n):[v if isinstance(v,int) else v.hex() for w,v in vals] for n,vals in info.values.items()}}),flush=True)
            if actual!=name or info.integer(4)!=ident: continue
            body=field(3,field(1,ident)+field(2,0))
            reply=Fields(await band._rpc('read_model_setting',1,14,body))
            value=Fields(Fields(reply.bytes(14)).bytes(3))
            if value.integer(1)!=ident or value.integer(2)!=0 or value.integer(3)!=0: raise ValueError('Read rejected')
            print(json.dumps({'id':ident,'name':name,'value':Fields(value.bytes(8 if ident==27 else 11)).integer(1)}),flush=True)
asyncio.run(main())
