#!/usr/bin/env python3
"""Inspect Getaway Shootout's visible branding objects and their renderer components.

This is read-only. It shows the difference between an active splash controller
and its visible logo so the scene transition can survive a visual cleanup.
"""
import gzip
import struct
from pathlib import Path
import UnityPy

ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'src/games/content/getaway-shootout/unity/GetawayShootout.data.unityweb'
buf=gzip.decompress(DATA.read_bytes())
magic=b'UnityWebData1.0\0'
assert buf.startswith(magic)
end=struct.unpack_from('<i',buf,len(magic))[0]
pos=len(magic)+4
embedded=[]
while pos<end:
    offset,size,nlen=struct.unpack_from('<iii',buf,pos)
    name=buf[pos+12:pos+12+nlen].decode()
    embedded.append((name,buf[offset:offset+size]))
    pos+=12+nlen
print('Archive files:',len(embedded))
scenes=[(n,body) for n,body in embedded if n=='data.unity3d']
assert len(scenes)==1
env=UnityPy.load(scenes[0][1])
targets=('two_logo','Branding_TwoPlayerGamesOrg','NewEichGames','Branding_Silvergames','Branding_CrazyGames','TwitterButton','BuyButton','Mobile')
components={}
for obj in env.objects:
    if obj.type.name != 'GameObject':continue
    go=obj.read()
    if go.m_Name not in targets: continue
    print(f'\nGAMEOBJECT {go.m_Name!r} path={obj.path_id} active={go.m_IsActive}',flush=True)
    parts=getattr(go,'m_Component',[])
    for part in parts:
        ptr=getattr(part,'component',None) or getattr(part,'m_Component',None)
        if ptr is None and isinstance(part,dict):ptr=part.get('component')
        try:
            cp=ptr.read() if ptr else None
            handle=ptr.get_obj() if ptr else None
            component_type=handle.type.name if handle else type(cp).__name__
            details={}
            for field in ('m_Name','m_Enabled','m_Color','m_Sprite','m_Texture','m_Material','m_IsActive','m_Text'):
                if cp is None or not hasattr(cp,field):continue
                val=getattr(cp,field)
                if field=='m_Color':
                    details[field]=[getattr(val,k,None) for k in ('r','g','b','a')]
                elif field in ('m_Sprite','m_Texture','m_Material'):
                    details[field]=str(getattr(val,'path_id',None))
                else:
                    details[field]=str(val)[:90]
            print('  component:',component_type,'path=',getattr(handle,'path_id','none'),'fields=',details,flush=True)
        except Exception as exc:print('  component read error:',type(exc).__name__,str(exc)[:200],flush=True)
for obj in env.objects:
    if obj.type.name not in ('Texture2D','Sprite','TextAsset'):continue
    try:
        val=obj.read()
        name=str(getattr(val,'m_Name',''))
        if any(k in name.lower() for k in ('logo','two','brand','game','eich','twitter','store','apple','crazy','silver','splash')):
            print('ASSET:',obj.type.name,name,'path',obj.path_id,flush=True)
    except Exception as exc:print('  asset error',obj.path_id,str(exc)[:100])
