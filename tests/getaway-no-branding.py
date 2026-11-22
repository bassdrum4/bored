#!/usr/bin/env python3
"""Regression check: external Getaway Shootout logos must stay invisible,
without disabling the Unity startup controller or the Play menus.
"""
import gzip
import struct
from pathlib import Path
import UnityPy

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/'src/games/content/getaway-shootout/unity/GetawayShootout.data.unityweb'
MAGIC=b'UnityWebData1.0\0'
raw=gzip.decompress(FILE.read_bytes())
assert raw.startswith(MAGIC)
end=struct.unpack_from('<i',raw,len(MAGIC))[0]
pos=len(MAGIC)+4
bundles=[]
while pos<end:
    start,size,ln=struct.unpack_from('<iii',raw,pos)
    name=raw[pos+12:pos+12+ln].decode()
    if name=='data.unity3d':bundles.append(raw[start:start+size])
    pos+=12+ln
assert pos==end and len(bundles)==1
env=UnityPy.load(bundles[0])
logos={'two_logo','two-logo-big','silvergames_logo_with_shadow-500x70',
       'CrazyGamesLogo','NeweichgamesSplash'}
seen=set()
states={}
for obj in env.objects:
    if obj.type.name=='Texture2D':
        texture=obj.read()
        if texture.m_Name in logos:
            seen.add(texture.m_Name)
            rgba=texture.image.convert('RGBA')
            assert rgba.getchannel('A').getextrema()==(0,0), f'Branded graphic visible: {texture.m_Name}'
    elif obj.type.name=='GameObject':
        go=obj.read()
        states.setdefault(go.m_Name,[]).append(bool(go.m_IsActive))
assert seen==logos, 'Expected logo assets changed: '+str(logos-seen)
assert states.get('two_logo')==[True], 'Splash controller cannot be disabled'
for name in ('Play','OnePlayer','Two Player','Settings'):
    assert any(states.get(name,[])), f'Game control disabled: {name}'
for name in ('Branding_TwoPlayerGamesOrg','Branding_Silvergames','Branding_CrazyGames','NewEichGames','Mobile'):
    assert not any(states.get(name,[])), f'External promotion re-enabled: {name}'
print('Getaway Shootout: all external logos invisible; startup and play controls intact')
