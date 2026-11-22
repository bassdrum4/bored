# Recovered class model (no-namespace / Assembly-CSharp scripts)

IL2CPP keeps compiled type and method names, so the shape of the original C# survives
even though every body became C++ and then asm.js. What is exact here: class names,
field names, method names, parameter counts, metadata tokens. What is not: field types
and method signatures (that needs the runtime Il2CppType table, which this export does
not expose) and bodies (the executable form is in `source/getaway-shootout.code.js`).

480 types.

## _Item  (token 0x0200000d)

```csharp
class _Item
{
    /* field */ key;
    /* field */ value;
    /* method */ .ctor(p1, p2);
}
```

## _KeysEnumerator  (token 0x0200000e)

```csharp
class _KeysEnumerator
{
    /* field */ m_collection;
    /* field */ m_position;
    /* method */ .ctor(p1);
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## $ArrayType=12  (token 0x020000b9)

```csharp
class $ArrayType=12
{
}
```

## $ArrayType=12  (token 0x02000058)

```csharp
class $ArrayType=12
{
}
```

## $ArrayType=16  (token 0x0200005a)

```csharp
class $ArrayType=16
{
}
```

## $ArrayType$1024  (token 0x02000386)

```csharp
class $ArrayType$1024
{
}
```

## $ArrayType$1024  (token 0x02000023)

```csharp
class $ArrayType$1024
{
}
```

## $ArrayType$12  (token 0x0200037e)

```csharp
class $ArrayType$12
{
}
```

## $ArrayType$12  (token 0x02000079)

```csharp
class $ArrayType$12
{
}
```

## $ArrayType$12  (token 0x0200009b)

```csharp
class $ArrayType$12
{
}
```

## $ArrayType$120  (token 0x02000378)

```csharp
class $ArrayType$120
{
}
```

## $ArrayType$120  (token 0x02000021)

```csharp
class $ArrayType$120
{
}
```

## $ArrayType$124  (token 0x02000382)

```csharp
class $ArrayType$124
{
}
```

## $ArrayType$128  (token 0x02000388)

```csharp
class $ArrayType$128
{
}
```

## $ArrayType$128  (token 0x0200009a)

```csharp
class $ArrayType$128
{
}
```

## $ArrayType$136  (token 0x0200037f)

```csharp
class $ArrayType$136
{
}
```

## $ArrayType$136  (token 0x02000020)

```csharp
class $ArrayType$136
{
}
```

## $ArrayType$16  (token 0x02000377)

```csharp
class $ArrayType$16
{
}
```

## $ArrayType$16  (token 0x0200007a)

```csharp
class $ArrayType$16
{
}
```

## $ArrayType$20  (token 0x0200037a)

```csharp
class $ArrayType$20
{
}
```

## $ArrayType$20  (token 0x02000075)

```csharp
class $ArrayType$20
{
}
```

## $ArrayType$2048  (token 0x02000384)

```csharp
class $ArrayType$2048
{
}
```

## $ArrayType$24  (token 0x02000376)

```csharp
class $ArrayType$24
{
}
```

## $ArrayType$256  (token 0x02000385)

```csharp
class $ArrayType$256
{
}
```

## $ArrayType$256  (token 0x02000074)

```csharp
class $ArrayType$256
{
}
```

## $ArrayType$256  (token 0x02000022)

```csharp
class $ArrayType$256
{
}
```

## $ArrayType$3132  (token 0x02000379)

```csharp
class $ArrayType$3132
{
}
```

## $ArrayType$3132  (token 0x02000073)

```csharp
class $ArrayType$3132
{
}
```

## $ArrayType$32  (token 0x0200037b)

```csharp
class $ArrayType$32
{
}
```

## $ArrayType$32  (token 0x02000076)

```csharp
class $ArrayType$32
{
}
```

## $ArrayType$4  (token 0x0200007b)

```csharp
class $ArrayType$4
{
}
```

## $ArrayType$48  (token 0x0200037c)

```csharp
class $ArrayType$48
{
}
```

## $ArrayType$48  (token 0x02000077)

```csharp
class $ArrayType$48
{
}
```

## $ArrayType$52  (token 0x02000389)

```csharp
class $ArrayType$52
{
}
```

## $ArrayType$56  (token 0x02000375)

```csharp
class $ArrayType$56
{
}
```

## $ArrayType$64  (token 0x0200037d)

```csharp
class $ArrayType$64
{
}
```

## $ArrayType$64  (token 0x02000078)

```csharp
class $ArrayType$64
{
}
```

## $ArrayType$640  (token 0x02000387)

```csharp
class $ArrayType$640
{
}
```

## $ArrayType$72  (token 0x02000381)

```csharp
class $ArrayType$72
{
}
```

## $ArrayType$8  (token 0x02000380)

```csharp
class $ArrayType$8
{
}
```

## $ArrayType$96  (token 0x02000383)

```csharp
class $ArrayType$96
{
}
```

## AddEventAdapter  (token 0x02000159)

```csharp
class AddEventAdapter
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## AIUpdate  (token 0x02000084)

```csharp
class AIUpdate
{
}
```

## AIUpdatePostScript  (token 0x0200008d)

```csharp
class AIUpdatePostScript
{
}
```

## AnalyticsManager  (token 0x02000002)

```csharp
class AnalyticsManager
{
    /* method */ .ctor();
    /* method */ PlayGame(p1);
    /* method */ FinishedGame(p1);
    /* method */ OpenWebsite(p1);
    /* method */ GameLoaded(p1);
    /* method */ AdWatch(p1);
    /* method */ ForcedAd(p1);
}
```

## Anim_ContinousMove  (token 0x0200003c)

```csharp
class Anim_ContinousMove
{
    /* field */ repeatX;
    /* field */ repeatTime;
    /* field */ startPos;
    /* field */ animTime;
    /* field */ rt;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## Anim_Fade  (token 0x0200003d)

```csharp
class Anim_Fade
{
    /* field */ targetAlpha;
    /* field */ timeLength;
    /* field */ waitTime;
    /* field */ animTime;
    /* field */ img;
    /* field */ t;
    /* field */ c;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ UpdateAlpha();
}
```

## Anim_FlashColor  (token 0x0200003e)

```csharp
class Anim_FlashColor
{
    /* field */ flashColors;
    /* field */ flashTime;
    /* field */ color;
    /* method */ .ctor();
    /* method */ OnEnable();
    /* method */ colorFlash();
}
```

## Anim_RectPos  (token 0x0200003f)

```csharp
class Anim_RectPos
{
    /* field */ animationTime;
    /* field */ targetPos;
    /* field */ waitTime;
    /* field */ destroyGameobject;
    /* field */ deactivateGameobject;
    /* field */ animationScript;
    /* field */ overideScript;
    /* field */ rt;
    /* field */ moving;
    /* field */ startPos;
    /* field */ curPos;
    /* field */ localTargetPos;
    /* method */ .ctor();
    /* method */ OnEnable();
    /* method */ Update();
    /* method */ Move();
    /* method */ MoveWithDeactivate(p1);
    /* method */ ReverseMovement(p1);
}
```

## Anim_RectSize  (token 0x02000040)

```csharp
class Anim_RectSize
{
    /* field */ targetSize;
    /* field */ moveSpeed;
    /* field */ le;
    /* field */ rt;
    /* field */ moving;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ Update();
}
```

## Anim_RepeatPos  (token 0x02000041)

```csharp
class Anim_RepeatPos
{
    /* field */ xAxis;
    /* field */ yAxis;
    /* field */ moveSpeed;
    /* field */ maxDist;
    /* field */ rt;
    /* field */ pos;
    /* field */ startPos;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## AnimationOffset  (token 0x02000003)

```csharp
class AnimationOffset
{
    /* field */ speedRange;
    /* field */ anim;
    /* method */ .ctor();
    /* method */ Start();
}
```

## ArrayListWrapper  (token 0x020000b6)

```csharp
class ArrayListWrapper
{
    /* field */ m_InnerArrayList;
    /* method */ .ctor(p1);
    /* method */ get_Item(p1);
    /* method */ set_Item(p1, p2);
    /* method */ get_Count();
    /* method */ get_Capacity();
    /* method */ set_Capacity(p1);
    /* method */ get_IsFixedSize();
    /* method */ get_IsReadOnly();
    /* method */ get_IsSynchronized();
    /* method */ get_SyncRoot();
    /* method */ Add(p1);
    /* method */ Clear();
    /* method */ Contains(p1);
    /* method */ IndexOf(p1);
    /* method */ IndexOf(p1, p2);
    /* method */ IndexOf(p1, p2, p3);
    /* method */ Insert(p1, p2);
    /* method */ InsertRange(p1, p2);
    /* method */ Remove(p1);
    /* method */ RemoveAt(p1);
    /* method */ CopyTo(p1);
    /* method */ CopyTo(p1, p2);
    /* method */ CopyTo(p1, p2, p3, p4);
    /* method */ GetEnumerator();
    /* method */ AddRange(p1);
    /* method */ Clone();
    /* method */ Sort();
    /* method */ Sort(p1);
    /* method */ ToArray();
    /* method */ ToArray(p1);
}
```

## ArrayNullFiller  (token 0x0200023c)

```csharp
class ArrayNullFiller
{
    /* field */ NullCount;
    /* method */ .ctor(p1);
}
```

## ArrayReadOnlyList`1  (token 0x0200002c)

```csharp
class ArrayReadOnlyList`1
{
    /* field */ array;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerable.GetEnumerator();
    /* method */ get_Item(p1);
    /* method */ set_Item(p1, p2);
    /* method */ get_Count();
    /* method */ get_IsReadOnly();
    /* method */ Add(p1);
    /* method */ Clear();
    /* method */ Contains(p1);
    /* method */ CopyTo(p1, p2);
    /* method */ GetEnumerator();
    /* method */ IndexOf(p1);
    /* method */ Insert(p1, p2);
    /* method */ Remove(p1);
    /* method */ RemoveAt(p1);
    /* method */ ReadOnlyError();
}
```

## AspectMode  (token 0x02000088)

```csharp
class AspectMode
{
    /* field */ value__;
    /* field */ None;
    /* field */ WidthControlsHeight;
    /* field */ HeightControlsWidth;
    /* field */ FitInParent;
    /* field */ EnvelopeParent;
}
```

## AsyncUploadTimeSlicedUpdate  (token 0x02000048)

```csharp
class AsyncUploadTimeSlicedUpdate
{
}
```

## AttributeInfo  (token 0x0200033c)

```csharp
class AttributeInfo
{
    /* field */ _usage;
    /* field */ _inheritanceLevel;
    /* method */ .ctor(p1, p2);
    /* method */ get_Usage();
    /* method */ get_InheritanceLevel();
}
```

## AttrListImpl  (token 0x02000097)

```csharp
class AttrListImpl
{
    /* field */ attrNames;
    /* field */ attrValues;
    /* method */ .ctor();
    /* method */ get_Length();
    /* method */ GetName(p1);
    /* method */ GetValue(p1);
    /* method */ GetValue(p1);
    /* method */ get_Names();
    /* method */ get_Values();
    /* method */ Clear();
    /* method */ Add(p1, p2);
}
```

## AudioConfigurationChangeHandler  (token 0x0200000f)

```csharp
class AudioConfigurationChangeHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## AudioFixedUpdate  (token 0x02000072)

```csharp
class AudioFixedUpdate
{
}
```

## Axis  (token 0x02000176)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x0200006d)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x02000079)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x02000091)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## BatchModeUpdate  (token 0x020000af)

```csharp
class BatchModeUpdate
{
}
```

## BitArrayEnumerator  (token 0x020000bb)

```csharp
class BitArrayEnumerator
{
    /* field */ _bitArray;
    /* field */ _current;
    /* field */ _index;
    /* field */ _version;
    /* method */ .ctor(p1);
    /* method */ Clone();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ checkVersion();
}
```

## BlockingObjects  (token 0x0200004b)

```csharp
class BlockingObjects
{
    /* field */ value__;
    /* field */ None;
    /* field */ TwoD;
    /* field */ ThreeD;
    /* field */ All;
}
```

## ButtonClick  (token 0x02000042)

```csharp
class ButtonClick
{
    /* method */ .ctor();
    /* method */ Click();
}
```

## ButtonClickedEvent  (token 0x0200003b)

```csharp
class ButtonClickedEvent
{
    /* method */ .ctor();
}
```

## ButtonState  (token 0x02000029)

```csharp
class ButtonState
{
    /* field */ m_Button;
    /* field */ m_EventData;
    /* method */ .ctor();
    /* method */ get_eventData();
    /* method */ set_eventData(p1);
    /* method */ get_button();
    /* method */ set_button(p1);
}
```

## CallbackHandler  (token 0x02000256)

```csharp
class CallbackHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CameraCallback  (token 0x0200001a)

```csharp
class CameraCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CameraMovement  (token 0x02000004)

```csharp
class CameraMovement
{
    /* field */ lerpSpeed;
    /* field */ offset;
    /* field */ targetPlayer;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ FixedUpdate();
    /* method */ ForceSet(p1, p2);
    /* method */ CreateNullTarget();
}
```

## Camo  (token 0x02000005)

```csharp
class Camo
{
    /* field */ hasCamo;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ SetCamo(p1);
}
```

## Category  (token 0x02000035)

```csharp
class Category
{
    /* field */ catName;
    /* field */ weight;
    /* field */ sprites;
    /* field */ faceVelocity;
    /* field */ ySpeed;
    /* field */ xSpeed;
    /* field */ tint;
    /* method */ .ctor();
}
```

## CategorySelect  (token 0x02000006)

```csharp
class CategorySelect
{
    /* field */ categoryObj;
    /* field */ textColors;
    /* field */ categoryHolder;
    /* field */ curCategory;
    /* field */ categoryWidth;
    /* field */ padding;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ characterChanged(p1);
    /* method */ UpdateBar(p1);
}
```

## cats  (token 0x02000016)

```csharp
class cats
{
    /* field */ value__;
    /* field */ Standard;
    /* field */ Special;
    /* field */ Action;
    /* field */ Map_Player;
    /* field */ Athlete;
    /* field */ Animals;
    /* field */ Famous;
}
```

## CertTypes  (token 0x02000036)

```csharp
class CertTypes
{
    /* field */ value__;
    /* field */ SslClient;
    /* field */ SslServer;
    /* field */ Smime;
    /* field */ ObjectSigning;
    /* field */ SslCA;
    /* field */ SmimeCA;
    /* field */ ObjectSigningCA;
}
```

## CharacterItem  (token 0x02000015)

```csharp
class CharacterItem
{
    /* field */ playerName;
    /* field */ playerID;
    /* field */ category;
    /* field */ summary;
    /* field */ playerBody;
    /* field */ playerArm;
    /* field */ playerHead;
    /* field */ specialUnlocks;
    /* field */ specialDetial;
    /* method */ .ctor();
}
```

## CharacterSelect  (token 0x02000007)

```csharp
class CharacterSelect
{
    /* field */ directionsObj;
    /* field */ characterObj;
    /* field */ lockedColor;
    /* field */ buttonColors;
    /* field */ characterHolder;
    /* field */ dragging;
    /* field */ curCharacter;
    /* field */ characterLocks;
    /* field */ characterWidth;
    /* field */ padding;
    /* field */ numberOfCharacters;
    /* field */ curPlayer;
    /* field */ nextButton;
    /* field */ playerText;
    /* field */ characterText;
    /* field */ cs;
    /* field */ summaryText;
    /* field */ specialButtons;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnEnable();
    /* method */ Update();
    /* method */ OnBeginDrag(p1);
    /* method */ OnEndDrag(p1);
    /* method */ characterChanged();
    /* method */ updateCharacterSizes();
    /* method */ ResetCharacterSize(p1);
    /* method */ UpdateUI();
    /* method */ ExitMenu();
    /* method */ Next();
    /* method */ ResetMenu();
    /* method */ UnlockCharacter(p1);
    /* method */ TwitterUnlock();
    /* method */ characterWaitUnlock(p1);
    /* method */ SetCharacterExternal(p1);
}
```

## CharacterUnlock  (token 0x02000008)

```csharp
class CharacterUnlock
{
    /* field */ animators;
    /* field */ deactivateObjects;
    /* field */ unlockMenu;
    /* field */ characterObj;
    /* field */ sounds;
    /* field */ particles;
    /* field */ character;
    /* field */ dropped;
    /* method */ .ctor();
    /* method */ LoadScene(p1);
    /* method */ getCharacter();
}
```

## CharacterValidation  (token 0x0200005b)

```csharp
class CharacterValidation
{
    /* field */ value__;
    /* field */ None;
    /* field */ Integer;
    /* field */ Decimal;
    /* field */ Alphanumeric;
    /* field */ Name;
    /* field */ EmailAddress;
}
```

## CheckTexFieldInput  (token 0x02000081)

```csharp
class CheckTexFieldInput
{
}
```

## ClearImmediateRenderers  (token 0x020000b3)

```csharp
class ClearImmediateRenderers
{
}
```

## ClearIntermediateRenderers  (token 0x02000056)

```csharp
class ClearIntermediateRenderers
{
}
```

## ClearLines  (token 0x02000057)

```csharp
class ClearLines
{
}
```

## ClearLines  (token 0x02000070)

```csharp
class ClearLines
{
}
```

## CloudWebServicesUpdate  (token 0x02000052)

```csharp
class CloudWebServicesUpdate
{
}
```

## coinLayout  (token 0x02000013)

```csharp
class coinLayout
{
    /* field */ amount;
    /* field */ description;
    /* method */ .ctor(p1, p2);
}
```

## Coins  (token 0x02000033)

```csharp
class Coins
{
    /* field */ placingAmounts;
    /* field */ coinsPerKill;
    /* field */ coinsPerGetaways;
    /* field */ positiveKD;
    /* field */ deathlessCoins;
    /* method */ .ctor();
    /* method */ .cctor();
}
```

## CoinUpdate  (token 0x02000043)

```csharp
class CoinUpdate
{
    /* field */ coins;
    /* field */ changed;
    /* field */ curCoins;
    /* field */ coinsText;
    /* field */ updateLength;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ updateCoins();
    /* method */ updateCoinText();
    /* method */ updateCoins(p1);
    /* method */ updateCoinsLate(p1);
    /* method */ CheckBuyCharacter();
}
```

## CollisionSound  (token 0x02000009)

```csharp
class CollisionSound
{
    /* field */ sound;
    /* field */ coolDownWait;
    /* field */ coolDownTime;
    /* method */ .ctor();
    /* method */ Update();
    /* method */ OnCollisionEnter2D(p1);
}
```

## ColorTweenCallback  (token 0x02000035)

```csharp
class ColorTweenCallback
{
    /* method */ .ctor();
}
```

## ColorTweenMode  (token 0x02000034)

```csharp
class ColorTweenMode
{
    /* field */ value__;
    /* field */ All;
    /* field */ RGB;
    /* field */ Alpha;
}
```

## ComputerInput  (token 0x0200000a)

```csharp
class ComputerInput
{
    /* field */ jumpDist;
    /* field */ wm;
    /* field */ pm;
    /* field */ pu;
    /* field */ ID;
    /* field */ needRot;
    /* field */ turnDir;
    /* field */ turning;
    /* field */ jumpWait;
    /* field */ usedPowerUp;
    /* field */ diff;
    /* field */ invDiff;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ StartTurn();
    /* method */ EndTurn();
    /* method */ Turn();
    /* method */ UsePU();
}
```

## ConnectionChangeEvent  (token 0x02000139)

```csharp
class ConnectionChangeEvent
{
    /* method */ .ctor();
}
```

## Constraint  (token 0x02000092)

```csharp
class Constraint
{
    /* field */ value__;
    /* field */ Flexible;
    /* field */ FixedColumnCount;
    /* field */ FixedRowCount;
}
```

## ConstraintManagerUpdate  (token 0x02000098)

```csharp
class ConstraintManagerUpdate
{
}
```

## ConsumeSampleFramesNativeFunction  (token 0x0200000c)

```csharp
class ConsumeSampleFramesNativeFunction
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## ContentInfo  (token 0x02000090)

```csharp
class ContentInfo
{
    /* field */ contentType;
    /* field */ content;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ .ctor(p1);
    /* method */ .ctor(p1);
    /* method */ get_ASN1();
    /* method */ get_Content();
    /* method */ set_Content(p1);
    /* method */ get_ContentType();
    /* method */ set_ContentType(p1);
    /* method */ GetASN1();
}
```

## ContentInfo  (token 0x0200000f)

```csharp
class ContentInfo
{
    /* field */ contentType;
    /* field */ content;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ .ctor(p1);
    /* method */ .ctor(p1);
    /* method */ get_ASN1();
    /* method */ get_Content();
    /* method */ set_Content(p1);
    /* method */ get_ContentType();
    /* method */ set_ContentType(p1);
    /* method */ GetASN1();
}
```

## ContentType  (token 0x02000059)

```csharp
class ContentType
{
    /* field */ value__;
    /* field */ Standard;
    /* field */ Autocorrected;
    /* field */ IntegerNumber;
    /* field */ DecimalNumber;
    /* field */ Alphanumeric;
    /* field */ Name;
    /* field */ EmailAddress;
    /* field */ Password;
    /* field */ Pin;
    /* field */ Custom;
}
```

## Context  (token 0x02000067)

```csharp
class Context
{
    /* field */ Option;
    /* field */ NeverMatchFlags;
    /* field */ AlwaysMatchFlags;
    /* field */ Buffer1;
    /* field */ Buffer2;
    /* field */ PrevCode;
    /* field */ PrevSortKey;
    /* field */ QuickCheckPossible;
    /* method */ .ctor(p1, p2, p3, p4, p5, p6, p7);
}
```

## Corner  (token 0x02000090)

```csharp
class Corner
{
    /* field */ value__;
    /* field */ UpperLeft;
    /* field */ UpperRight;
    /* field */ LowerLeft;
    /* field */ LowerRight;
}
```

## CostDelegate  (token 0x02000078)

```csharp
class CostDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CountdownItem  (token 0x02000018)

```csharp
class CountdownItem
{
    /* field */ getawayName;
    /* field */ sound;
    /* method */ .ctor();
}
```

## CountdownMenu  (token 0x0200000b)

```csharp
class CountdownMenu
{
    /* field */ countdowns;
    /* field */ gettotheSound;
    /* field */ getawaySound;
    /* field */ general;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ soundPlay();
}
```

## CullStateChangedEvent  (token 0x02000063)

```csharp
class CullStateChangedEvent
{
    /* method */ .ctor();
}
```

## CustomInfo  (token 0x02000346)

```csharp
class CustomInfo
{
    /* field */ UseGroup;
    /* field */ DecimalDigits;
    /* field */ DecimalPointPos;
    /* field */ DecimalTailSharpDigits;
    /* field */ IntegerDigits;
    /* field */ IntegerHeadSharpDigits;
    /* field */ IntegerHeadPos;
    /* field */ UseExponent;
    /* field */ ExponentDigits;
    /* field */ ExponentTailSharpDigits;
    /* field */ ExponentNegativeSignOnly;
    /* field */ DividePlaces;
    /* field */ Percents;
    /* field */ Permilles;
    /* method */ .ctor();
    /* method */ GetActiveSection(p1, p2, p3, p4, p5);
    /* method */ Parse(p1, p2, p3, p4);
    /* method */ Format(p1, p2, p3, p4, p5, p6, p7, p8);
}
```

## Data  (token 0x020000f2)

```csharp
class Data
{
    /* field */ ansi;
    /* field */ ebcdic;
    /* field */ mac;
    /* field */ oem;
    /* field */ list_sep;
}
```

## DblClickSnapping  (token 0x0200001b)

```csharp
class DblClickSnapping
{
    /* field */ value__;
    /* field */ WORDS;
    /* field */ PARAGRAPHS;
}
```

## DebuggingModes  (token 0x020000d9)

```csharp
class DebuggingModes
{
    /* field */ value__;
    /* field */ None;
    /* field */ Default;
    /* field */ IgnoreSymbolStoreSequencePoints;
    /* field */ EnableEditAndContinue;
    /* field */ DisableOptimizations;
}
```

## Default  (token 0x02000150)

```csharp
class Default
{
    /* method */ .ctor();
    /* method */ BindToMethod(p1, p2, p3, p4, p5, p6, p7);
    /* method */ ReorderParameters(p1, p2, p3);
    /* method */ IsArrayAssignable(p1, p2);
    /* method */ ChangeType(p1, p2, p3);
    /* method */ ReorderArgumentArray(p1, p2);
    /* method */ check_type(p1, p2);
    /* method */ check_arguments(p1, p2, p3);
    /* method */ SelectMethod(p1, p2, p3, p4);
    /* method */ SelectMethod(p1, p2, p3, p4, p5);
    /* method */ GetBetterMethod(p1, p2, p3);
    /* method */ CompareCloserType(p1, p2);
    /* method */ SelectProperty(p1, p2, p3, p4, p5);
    /* method */ check_arguments_with_score(p1, p2);
    /* method */ check_type_with_score(p1, p2);
}
```

## DefaultComparer  (token 0x0200009d)

```csharp
class DefaultComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
}
```

## DefaultComparer  (token 0x020000a9)

```csharp
class DefaultComparer
{
    /* method */ .ctor();
    /* method */ GetHashCode(p1);
    /* method */ Equals(p1, p2);
}
```

## DeliverIosPlatformEvents  (token 0x02000067)

```csharp
class DeliverIosPlatformEvents
{
}
```

## DeriveBytes  (token 0x02000085)

```csharp
class DeriveBytes
{
    /* field */ keyDiversifier;
    /* field */ ivDiversifier;
    /* field */ macDiversifier;
    /* field */ _hashName;
    /* field */ _iterations;
    /* field */ _password;
    /* field */ _salt;
    /* method */ .ctor();
    /* method */ .cctor();
    /* method */ set_HashName(p1);
    /* method */ set_IterationCount(p1);
    /* method */ set_Password(p1);
    /* method */ set_Salt(p1);
    /* method */ Adjust(p1, p2, p3);
    /* method */ Derive(p1, p2);
    /* method */ DeriveKey(p1);
    /* method */ DeriveIV(p1);
    /* method */ DeriveMAC(p1);
}
```

## DeriveBytes  (token 0x02000021)

```csharp
class DeriveBytes
{
    /* field */ keyDiversifier;
    /* field */ ivDiversifier;
    /* field */ macDiversifier;
    /* field */ _hashName;
    /* field */ _iterations;
    /* field */ _password;
    /* field */ _salt;
    /* method */ .ctor();
    /* method */ .cctor();
    /* method */ set_HashName(p1);
    /* method */ set_IterationCount(p1);
    /* method */ set_Password(p1);
    /* method */ set_Salt(p1);
    /* method */ Adjust(p1, p2, p3);
    /* method */ Derive(p1, p2);
    /* method */ DeriveKey(p1);
    /* method */ DeriveIV(p1);
    /* method */ DeriveMAC(p1);
}
```

## DestoryObj  (token 0x0200000c)

```csharp
class DestoryObj
{
    /* field */ destroyTime;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ destroy();
}
```

## DictionaryEnumerator  (token 0x02000202)

```csharp
class DictionaryEnumerator
{
    /* field */ _methodDictionary;
    /* field */ _hashtableEnum;
    /* field */ _posMethod;
    /* method */ .ctor(p1);
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
}
```

## DictionaryNode  (token 0x0200000a)

```csharp
class DictionaryNode
{
    /* field */ key;
    /* field */ value;
    /* field */ next;
    /* method */ .ctor(p1, p2, p3);
}
```

## DictionaryNodeEnumerator  (token 0x0200000b)

```csharp
class DictionaryNodeEnumerator
{
    /* field */ dict;
    /* field */ isAtStart;
    /* field */ current;
    /* field */ version;
    /* method */ .ctor(p1);
    /* method */ FailFast();
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ get_Current();
    /* method */ get_DictionaryNode();
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
}
```

## Direction  (token 0x0200006b)

```csharp
class Direction
{
    /* field */ value__;
    /* field */ LeftToRight;
    /* field */ RightToLeft;
    /* field */ BottomToTop;
    /* field */ TopToBottom;
}
```

## Direction  (token 0x02000077)

```csharp
class Direction
{
    /* field */ value__;
    /* field */ LeftToRight;
    /* field */ RightToLeft;
    /* field */ BottomToTop;
    /* field */ TopToBottom;
}
```

## DirectorDeferredEvaluate  (token 0x02000091)

```csharp
class DirectorDeferredEvaluate
{
}
```

## DirectorFixedSampleTime  (token 0x02000071)

```csharp
class DirectorFixedSampleTime
{
}
```

## DirectorFixedUpdate  (token 0x02000074)

```csharp
class DirectorFixedUpdate
{
}
```

## DirectorFixedUpdatePostPhysics  (token 0x02000079)

```csharp
class DirectorFixedUpdatePostPhysics
{
}
```

## DirectorLateUpdate  (token 0x020000a0)

```csharp
class DirectorLateUpdate
{
}
```

## DirectorRenderImage  (token 0x020000ac)

```csharp
class DirectorRenderImage
{
}
```

## DirectorSampleTime  (token 0x02000069)

```csharp
class DirectorSampleTime
{
}
```

## DirectorUpdate  (token 0x0200008a)

```csharp
class DirectorUpdate
{
}
```

## DirectorUpdateAnimationBegin  (token 0x0200008e)

```csharp
class DirectorUpdateAnimationBegin
{
}
```

## DirectorUpdateAnimationEnd  (token 0x02000090)

```csharp
class DirectorUpdateAnimationEnd
{
}
```

## DisableComponents  (token 0x0200000d)

```csharp
class DisableComponents
{
    /* field */ disableComponents;
    /* method */ .ctor();
    /* method */ Enable(p1, p2);
}
```

## DispatchEventQueueEvents  (token 0x02000068)

```csharp
class DispatchEventQueueEvents
{
}
```

## DisplaysUpdatedDelegate  (token 0x02000153)

```csharp
class DisplaysUpdatedDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## Door  (token 0x0200000e)

```csharp
class Door
{
    /* field */ doorOpen;
    /* field */ opened;
    /* method */ .ctor();
    /* method */ Open();
    /* method */ OnCollisionEnter2D(p1);
}
```

## DropdownEvent  (token 0x02000046)

```csharp
class DropdownEvent
{
    /* method */ .ctor();
}
```

## DropdownItem  (token 0x02000043)

```csharp
class DropdownItem
{
    /* field */ m_Text;
    /* field */ m_Image;
    /* field */ m_RectTransform;
    /* field */ m_Toggle;
    /* method */ .ctor();
    /* method */ get_text();
    /* method */ set_text(p1);
    /* method */ get_image();
    /* method */ set_image(p1);
    /* method */ get_rectTransform();
    /* method */ set_rectTransform(p1);
    /* method */ get_toggle();
    /* method */ set_toggle(p1);
    /* method */ OnPointerEnter(p1);
    /* method */ OnCancel(p1);
}
```

## DynamicPropertyReg  (token 0x020001d9)

```csharp
class DynamicPropertyReg
{
    /* field */ Property;
    /* field */ Sink;
    /* method */ .ctor();
}
```

## Edge  (token 0x02000175)

```csharp
class Edge
{
    /* field */ value__;
    /* field */ Left;
    /* field */ Right;
    /* field */ Top;
    /* field */ Bottom;
}
```

## EditState  (token 0x02000060)

```csharp
class EditState
{
    /* field */ value__;
    /* field */ Continue;
    /* field */ Finish;
}
```

## Elevator  (token 0x0200000f)

```csharp
class Elevator
{
    /* field */ positions;
    /* field */ goingUp;
    /* field */ speed;
    /* field */ waitAmount;
    /* field */ startDarkness;
    /* field */ waitTime;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ FixedUpdate();
}
```

## EncryptedData  (token 0x02000091)

```csharp
class EncryptedData
{
    /* field */ _version;
    /* field */ _content;
    /* field */ _encryptionAlgorithm;
    /* field */ _encrypted;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_EncryptionAlgorithm();
    /* method */ get_EncryptedContent();
}
```

## EncryptedData  (token 0x02000010)

```csharp
class EncryptedData
{
    /* field */ _version;
    /* field */ _content;
    /* field */ _encryptionAlgorithm;
    /* field */ _encrypted;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_EncryptionAlgorithm();
    /* method */ get_EncryptedContent();
}
```

## EncryptedPrivateKeyInfo  (token 0x0200007f)

```csharp
class EncryptedPrivateKeyInfo
{
    /* field */ _algorithm;
    /* field */ _salt;
    /* field */ _iterations;
    /* field */ _data;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_Algorithm();
    /* method */ get_EncryptedData();
    /* method */ get_Salt();
    /* method */ get_IterationCount();
    /* method */ Decode(p1);
}
```

## EncryptedPrivateKeyInfo  (token 0x0200001b)

```csharp
class EncryptedPrivateKeyInfo
{
    /* field */ _algorithm;
    /* field */ _salt;
    /* field */ _iterations;
    /* field */ _data;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_Algorithm();
    /* method */ get_EncryptedData();
    /* method */ get_Salt();
    /* method */ get_IterationCount();
    /* method */ Decode(p1);
}
```

## EndGraphicsJobsLate  (token 0x02000095)

```csharp
class EndGraphicsJobsLate
{
}
```

## EnlightenRuntimeUpdate  (token 0x020000a7)

```csharp
class EnlightenRuntimeUpdate
{
}
```

## Entry  (token 0x02000018)

```csharp
class Entry
{
    /* field */ eventID;
    /* field */ callback;
    /* method */ .ctor();
}
```

## Enumerator  (token 0x020000a2)

```csharp
class Enumerator
{
    /* field */ dictionary;
    /* field */ next;
    /* field */ stamp;
    /* field */ current;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IDictionaryEnumerator.get_Entry();
    /* method */ System.Collections.IDictionaryEnumerator.get_Key();
    /* method */ System.Collections.IDictionaryEnumerator.get_Value();
    /* method */ MoveNext();
    /* method */ get_Current();
    /* method */ get_CurrentKey();
    /* method */ get_CurrentValue();
    /* method */ Reset();
    /* method */ VerifyState();
    /* method */ VerifyCurrent();
    /* method */ Dispose();
}
```

## Enumerator  (token 0x020000a4)

```csharp
class Enumerator
{
    /* field */ host_enumerator;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ Dispose();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x020000a6)

```csharp
class Enumerator
{
    /* field */ host_enumerator;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ Dispose();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x020000b1)

```csharp
class Enumerator
{
    /* field */ l;
    /* field */ next;
    /* field */ ver;
    /* field */ current;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ Dispose();
    /* method */ VerifyState();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x020000c6)

```csharp
class Enumerator
{
    /* field */ host;
    /* field */ stamp;
    /* field */ pos;
    /* field */ size;
    /* field */ mode;
    /* field */ currentKey;
    /* field */ currentValue;
    /* field */ xstr;
    /* method */ .ctor(p1, p2);
    /* method */ .cctor();
    /* method */ FailFast();
    /* method */ Reset();
    /* method */ MoveNext();
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x020000d2)

```csharp
class Enumerator
{
    /* field */ host;
    /* field */ stamp;
    /* field */ pos;
    /* field */ size;
    /* field */ mode;
    /* field */ currentKey;
    /* field */ currentValue;
    /* field */ invalid;
    /* field */ xstr;
    /* method */ .ctor(p1, p2);
    /* method */ .cctor();
    /* method */ Reset();
    /* method */ MoveNext();
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
    /* method */ get_Current();
    /* method */ Clone();
}
```

## Enumerator  (token 0x020000d4)

```csharp
class Enumerator
{
    /* field */ stack;
    /* field */ modCount;
    /* field */ current;
    /* method */ .ctor(p1);
    /* method */ Clone();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## Enumerator  (token 0x02000005)

```csharp
class Enumerator
{
    /* field */ q;
    /* field */ idx;
    /* field */ ver;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ Dispose();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x02000007)

```csharp
class Enumerator
{
    /* field */ parent;
    /* field */ idx;
    /* field */ _version;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ Dispose();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## Enumerator  (token 0x0200005b)

```csharp
class Enumerator
{
    /* field */ index;
    /* field */ coll;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.MoveNext();
}
```

## Enumerator  (token 0x02000077)

```csharp
class Enumerator
{
    /* field */ list;
    /* field */ ptr;
    /* method */ .ctor(p1);
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## Enumerator  (token 0x02000009)

```csharp
class Enumerator
{
    /* field */ hashset;
    /* field */ next;
    /* field */ stamp;
    /* field */ current;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ MoveNext();
    /* method */ get_Current();
    /* method */ Dispose();
    /* method */ CheckState();
}
```

## Enumerator  (token 0x02000170)

```csharp
class Enumerator
{
    /* field */ outer;
    /* field */ currentIndex;
    /* method */ .ctor(p1);
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## EnumeratorMode  (token 0x020000c5)

```csharp
class EnumeratorMode
{
    /* field */ value__;
    /* field */ KEY_MODE;
    /* field */ VALUE_MODE;
    /* field */ ENTRY_MODE;
}
```

## EnumeratorMode  (token 0x020000d1)

```csharp
class EnumeratorMode
{
    /* field */ value__;
    /* field */ KEY_MODE;
    /* field */ VALUE_MODE;
    /* field */ ENTRY_MODE;
}
```

## Escape  (token 0x02000069)

```csharp
class Escape
{
    /* field */ Source;
    /* field */ Index;
    /* field */ Start;
    /* field */ End;
    /* field */ Optional;
}
```

## EventFunction`1  (token 0x0200001b)

```csharp
class EventFunction`1
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## EvidenceEnumerator  (token 0x020002b0)

```csharp
class EvidenceEnumerator
{
    /* field */ currentEnum;
    /* field */ hostEnum;
    /* field */ assemblyEnum;
    /* method */ .ctor(p1, p2);
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ get_Current();
}
```

## ExecuteGameCenterCallbacks  (token 0x020000bd)

```csharp
class ExecuteGameCenterCallbacks
{
}
```

## ExecuteMainThreadJobs  (token 0x02000054)

```csharp
class ExecuteMainThreadJobs
{
}
```

## Explode  (token 0x02000028)

```csharp
class Explode
{
    /* field */ weaponName;
    /* field */ ourPlayer;
    /* field */ range;
    /* field */ bias;
    /* field */ maxHealthDamage;
    /* field */ maxKnockback;
    /* field */ explosionTimer;
    /* field */ trail;
    /* field */ explosionParticles;
    /* field */ playerid;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnCollisionEnter2D(p1);
    /* method */ explode();
    /* method */ DeactivateTrail();
}
```

## ExtenderType  (token 0x0200006a)

```csharp
class ExtenderType
{
    /* field */ value__;
    /* field */ None;
    /* field */ Simple;
    /* field */ Voiced;
    /* field */ Conditional;
    /* field */ Buggy;
}
```

## Fallback  (token 0x0200000d)

```csharp
class Fallback
{
    /* field */ value__;
    /* field */ Default;
    /* field */ Throw;
}
```

## FieldWithTarget  (token 0x0200000f)

```csharp
class FieldWithTarget
{
    /* field */ m_ParamName;
    /* field */ m_Target;
    /* field */ m_FieldPath;
    /* field */ m_TypeString;
    /* field */ m_DoStatic;
    /* field */ m_StaticString;
    /* method */ .ctor();
    /* method */ get_paramName();
    /* method */ set_paramName(p1);
    /* method */ get_target();
    /* method */ set_target(p1);
    /* method */ get_fieldPath();
    /* method */ set_fieldPath(p1);
    /* method */ get_typeString();
    /* method */ set_typeString(p1);
    /* method */ get_doStatic();
    /* method */ set_doStatic(p1);
    /* method */ get_staticString();
    /* method */ set_staticString(p1);
    /* method */ GetValue();
}
```

## FillMethod  (token 0x02000050)

```csharp
class FillMethod
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
    /* field */ Radial90;
    /* field */ Radial180;
    /* field */ Radial360;
}
```

## FinishFrameRendering  (token 0x020000ae)

```csharp
class FinishFrameRendering
{
}
```

## FitMode  (token 0x0200008e)

```csharp
class FitMode
{
    /* field */ value__;
    /* field */ Unconstrained;
    /* field */ MinSize;
    /* field */ PreferredSize;
}
```

## FixedSizeArrayListWrapper  (token 0x020000b8)

```csharp
class FixedSizeArrayListWrapper
{
    /* method */ .ctor(p1);
    /* method */ get_ErrorMessage();
    /* method */ get_Capacity();
    /* method */ set_Capacity(p1);
    /* method */ get_IsFixedSize();
    /* method */ Add(p1);
    /* method */ AddRange(p1);
    /* method */ Clear();
    /* method */ Insert(p1, p2);
    /* method */ InsertRange(p1, p2);
    /* method */ Remove(p1);
    /* method */ RemoveAt(p1);
}
```

## FloatTweenCallback  (token 0x02000037)

```csharp
class FloatTweenCallback
{
    /* method */ .ctor();
}
```

## FontTextureRebuildCallback  (token 0x0200000a)

```csharp
class FontTextureRebuildCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## ForwardingDecoder  (token 0x020002de)

```csharp
class ForwardingDecoder
{
    /* field */ encoding;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## FramePressState  (token 0x02000025)

```csharp
class FramePressState
{
    /* field */ value__;
    /* field */ Pressed;
    /* field */ Released;
    /* field */ PressedAndReleased;
    /* field */ NotChanged;
}
```

## GameLog  (token 0x02000010)

```csharp
class GameLog
{
    /* field */ logObj;
    /* field */ defualtIcons;
    /* method */ .ctor();
    /* method */ createLog(p1, p2, p3, p4, p5);
}
```

## Gamemanager  (token 0x02000011)

```csharp
class Gamemanager
{
    /* field */ testingMap;
    /* field */ wm;
    /* field */ firstPlay;
    /* field */ playerRoundWins;
    /* field */ totalPlayerRoundWins;
    /* field */ playerFinshOrder;
    /* field */ characters;
    /* field */ playerObj;
    /* field */ computerObj;
    /* field */ cameras;
    /* field */ splitScreenBar;
    /* field */ finishedPlayers;
    /* field */ playerTwoCanvas;
    /* field */ roundWinner;
    /* field */ winnerText;
    /* field */ goMenu;
    /* field */ skinColors;
    /* field */ readyUpMenu;
    /* field */ soundStartMenu;
    /* field */ topBar;
    /* field */ tieText;
    /* field */ players;
    /* field */ maps;
    /* field */ curMap;
    /* field */ firstW;
    /* field */ transport;
    /* field */ sp;
    /* field */ movingf;
    /* field */ playerColors;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ SetPlayers();
    /* method */ CreatePlayers();
    /* method */ StartGame();
    /* method */ Respawn(p1);
    /* method */ Finish(p1);
    /* method */ SpawnPlayer(p1, p2, p3);
    /* method */ PlayersReady();
    /* method */ EndCountdown();
    /* method */ showEnd();
    /* method */ endLevel();
    /* method */ Gameover(p1);
    /* method */ DisablePlayer(p1, p2, p3, p4);
    /* method */ PlayAgain();
    /* method */ resetToFirstPlay();
    /* method */ Pause(p1);
    /* method */ Menu();
    /* method */ .cctor();
}
```

## GameoverMenu  (token 0x02000012)

```csharp
class GameoverMenu
{
    /* field */ coinObj;
    /* field */ coinHolder;
    /* field */ gm;
    /* field */ coins;
    /* field */ placingNames;
    /* method */ .ctor();
    /* method */ Gameover(p1);
    /* method */ CountCoins();
    /* method */ updateCoinList(p1);
    /* method */ getPlayerPlacing();
}
```

## GetRaycastNonAllocCallback  (token 0x020000a9)

```csharp
class GetRaycastNonAllocCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1);
}
```

## GetRayIntersectionAllCallback  (token 0x020000a7)

```csharp
class GetRayIntersectionAllCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## GetRayIntersectionAllNonAllocCallback  (token 0x020000a8)

```csharp
class GetRayIntersectionAllNonAllocCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1);
}
```

## Getter`2  (token 0x02000170)

```csharp
class Getter`2
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## GetterAdapter  (token 0x0200016f)

```csharp
class GetterAdapter
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## GpuTimestamp  (token 0x02000050)

```csharp
class GpuTimestamp
{
}
```

## GUIClearEvents  (token 0x020000b7)

```csharp
class GUIClearEvents
{
}
```

## GuidParser  (token 0x0200032c)

```csharp
class GuidParser
{
    /* field */ _src;
    /* field */ _length;
    /* field */ _cur;
    /* method */ .ctor(p1);
    /* method */ Reset();
    /* method */ AtEnd();
    /* method */ ThrowFormatException();
    /* method */ ParseHex(p1, p2);
    /* method */ ParseOptChar(p1);
    /* method */ ParseChar(p1);
    /* method */ ParseGuid1();
    /* method */ ParseHexPrefix();
    /* method */ ParseGuid2();
    /* method */ Parse();
}
```

## Gun  (token 0x02000029)

```csharp
class Gun
{
    /* field */ shootLine;
    /* field */ hitParticles;
    /* field */ bulletObj;
    /* field */ shotLength;
    /* field */ power;
    /* field */ healthDamage;
    /* field */ fallOffDamage;
    /* field */ fallOffBias;
    /* field */ collateralDamage;
    /* field */ bulletSpr;
    /* field */ ourCollider;
    /* field */ shotParticle;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Use();
}
```

## HashKeys  (token 0x020000c7)

```csharp
class HashKeys
{
    /* field */ host;
    /* method */ .ctor(p1);
    /* method */ get_Count();
    /* method */ get_IsSynchronized();
    /* method */ get_SyncRoot();
    /* method */ CopyTo(p1, p2);
    /* method */ GetEnumerator();
}
```

## HashValues  (token 0x020000c8)

```csharp
class HashValues
{
    /* field */ host;
    /* method */ .ctor(p1);
    /* method */ get_Count();
    /* method */ get_IsSynchronized();
    /* method */ get_SyncRoot();
    /* method */ CopyTo(p1, p2);
    /* method */ GetEnumerator();
}
```

## Health  (token 0x02000014)

```csharp
class Health
{
    /* field */ startHealth;
    /* field */ destroyOnDead;
    /* field */ curHealth;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ takeDamage(p1);
    /* method */ Alive();
    /* method */ Die();
}
```

## HealthUI  (token 0x02000044)

```csharp
class HealthUI
{
    /* field */ healthImages;
    /* field */ heartBeatMult;
    /* field */ active;
    /* field */ gm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ Deactivate();
}
```

## HitInfo  (token 0x02000044)

```csharp
class HitInfo
{
    /* field */ target;
    /* field */ camera;
    /* method */ SendMessage(p1);
    /* method */ op_Implicit(p1);
    /* method */ Compare(p1, p2);
}
```

## IAttrList  (token 0x02000096)

```csharp
class IAttrList
{
    /* method */ get_Length();
    /* method */ GetName(p1);
    /* method */ GetValue(p1);
    /* method */ GetValue(p1);
    /* method */ get_Names();
    /* method */ get_Values();
}
```

## IContentHandler  (token 0x02000095)

```csharp
class IContentHandler
{
    /* method */ OnStartParsing(p1);
    /* method */ OnEndParsing(p1);
    /* method */ OnStartElement(p1, p2);
    /* method */ OnEndElement(p1);
    /* method */ OnProcessingInstruction(p1, p2);
    /* method */ OnChars(p1);
    /* method */ OnIgnorableWhitespace(p1);
}
```

## IMGUISendQueuedEvents  (token 0x02000082)

```csharp
class IMGUISendQueuedEvents
{
}
```

## InputButton  (token 0x02000024)

```csharp
class InputButton
{
    /* field */ value__;
    /* field */ Left;
    /* field */ Right;
    /* field */ Middle;
}
```

## InputEndFrame  (token 0x020000b6)

```csharp
class InputEndFrame
{
}
```

## InputMode  (token 0x0200002d)

```csharp
class InputMode
{
    /* field */ value__;
    /* field */ Mouse;
    /* field */ Buttons;
}
```

## InputType  (token 0x0200005a)

```csharp
class InputType
{
    /* field */ value__;
    /* field */ Standard;
    /* field */ AutoCorrect;
    /* field */ Password;
}
```

## IntComparer  (token 0x02000321)

```csharp
class IntComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## InternalAsyncResult  (token 0x02000059)

```csharp
class InternalAsyncResult
{
    /* field */ locker;
    /* field */ _userCallback;
    /* field */ _userState;
    /* field */ _asyncException;
    /* field */ handle;
    /* field */ completed;
    /* field */ _bytesRead;
    /* field */ _fromWrite;
    /* field */ _proceedAfterHandshake;
    /* field */ _buffer;
    /* field */ _offset;
    /* field */ _count;
    /* method */ .ctor(p1, p2, p3, p4, p5, p6, p7);
    /* method */ get_ProceedAfterHandshake();
    /* method */ get_FromWrite();
    /* method */ get_Buffer();
    /* method */ get_Offset();
    /* method */ get_Count();
    /* method */ get_BytesRead();
    /* method */ get_AsyncState();
    /* method */ get_AsyncException();
    /* method */ get_CompletedWithError();
    /* method */ get_AsyncWaitHandle();
    /* method */ get_IsCompleted();
    /* method */ SetComplete(p1, p2);
    /* method */ SetComplete(p1);
    /* method */ SetComplete(p1);
    /* method */ SetComplete();
}
```

## InternalEnumerator`1  (token 0x0200002a)

```csharp
class InternalEnumerator`1
{
    /* field */ array;
    /* field */ idx;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ Dispose();
    /* method */ MoveNext();
    /* method */ get_Current();
}
```

## InternalShaderChannel  (token 0x0200003f)

```csharp
class InternalShaderChannel
{
    /* field */ value__;
    /* field */ Vertex;
    /* field */ Normal;
    /* field */ Tangent;
    /* field */ Color;
    /* field */ TexCoord0;
    /* field */ TexCoord1;
    /* field */ TexCoord2;
    /* field */ TexCoord3;
    /* field */ TexCoord4;
    /* field */ TexCoord5;
    /* field */ TexCoord6;
    /* field */ TexCoord7;
}
```

## InternalVertexChannelType  (token 0x02000040)

```csharp
class InternalVertexChannelType
{
    /* field */ value__;
    /* field */ Float;
    /* field */ Color;
}
```

## IntStack  (token 0x02000072)

```csharp
class IntStack
{
    /* field */ values;
    /* field */ count;
    /* method */ Pop();
    /* method */ Push(p1);
    /* method */ get_Count();
    /* method */ set_Count(p1);
}
```

## InvertButton  (token 0x02000045)

```csharp
class InvertButton
{
    /* field */ shadows;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnPointerDown(p1);
    /* method */ OnPointerUp(p1);
    /* method */ SwapColors();
}
```

## Kernel  (token 0x02000074)

```csharp
class Kernel
{
    /* method */ AddSameSign(p1, p2);
    /* method */ Subtract(p1, p2);
    /* method */ MinusEq(p1, p2);
    /* method */ PlusEq(p1, p2);
    /* method */ Compare(p1, p2);
    /* method */ SingleByteDivideInPlace(p1, p2);
    /* method */ DwordMod(p1, p2);
    /* method */ DwordDivMod(p1, p2);
    /* method */ multiByteDivide(p1, p2);
    /* method */ LeftShift(p1, p2);
    /* method */ RightShift(p1, p2);
    /* method */ MultiplyByDword(p1, p2);
    /* method */ Multiply(p1, p2, p3, p4, p5, p6, p7, p8);
    /* method */ MultiplyMod2p32pmod(p1, p2, p3, p4, p5, p6, p7, p8, p9);
    /* method */ modInverse(p1, p2);
    /* method */ modInverse(p1, p2);
}
```

## Kernel  (token 0x02000006)

```csharp
class Kernel
{
    /* method */ AddSameSign(p1, p2);
    /* method */ Subtract(p1, p2);
    /* method */ MinusEq(p1, p2);
    /* method */ PlusEq(p1, p2);
    /* method */ Compare(p1, p2);
    /* method */ SingleByteDivideInPlace(p1, p2);
    /* method */ DwordMod(p1, p2);
    /* method */ DwordDivMod(p1, p2);
    /* method */ multiByteDivide(p1, p2);
    /* method */ LeftShift(p1, p2);
    /* method */ RightShift(p1, p2);
    /* method */ Multiply(p1, p2, p3, p4, p5, p6, p7, p8);
    /* method */ MultiplyMod2p32pmod(p1, p2, p3, p4, p5, p6, p7, p8, p9);
    /* method */ modInverse(p1, p2);
    /* method */ modInverse(p1, p2);
}
```

## Key  (token 0x02000064)

```csharp
class Key
{
    /* field */ pattern;
    /* field */ options;
    /* method */ .ctor(p1, p2);
    /* method */ GetHashCode();
    /* method */ Equals(p1);
    /* method */ ToString();
}
```

## KeyCollection  (token 0x020000a3)

```csharp
class KeyCollection
{
    /* field */ dictionary;
    /* method */ .ctor(p1);
    /* method */ System.Collections.Generic.ICollection<TKey>.Add(p1);
    /* method */ System.Collections.Generic.ICollection<TKey>.Clear();
    /* method */ System.Collections.Generic.ICollection<TKey>.Contains(p1);
    /* method */ System.Collections.Generic.ICollection<TKey>.Remove(p1);
    /* method */ System.Collections.Generic.IEnumerable<TKey>.GetEnumerator();
    /* method */ System.Collections.ICollection.CopyTo(p1, p2);
    /* method */ System.Collections.IEnumerable.GetEnumerator();
    /* method */ System.Collections.Generic.ICollection<TKey>.get_IsReadOnly();
    /* method */ System.Collections.ICollection.get_IsSynchronized();
    /* method */ System.Collections.ICollection.get_SyncRoot();
    /* method */ CopyTo(p1, p2);
    /* method */ GetEnumerator();
    /* method */ get_Count();
}
```

## KeyGeneratedEventHandler  (token 0x02000079)

```csharp
class KeyGeneratedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## KeyGeneratedEventHandler  (token 0x02000081)

```csharp
class KeyGeneratedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## KeyGeneratedEventHandler  (token 0x0200001e)

```csharp
class KeyGeneratedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## KeyMarker  (token 0x020000c4)

```csharp
class KeyMarker
{
    /* field */ Removed;
    /* method */ .ctor();
    /* method */ .cctor();
}
```

## KeysCollection  (token 0x0200000f)

```csharp
class KeysCollection
{
    /* field */ m_collection;
    /* method */ .ctor(p1);
    /* method */ System.Collections.ICollection.CopyTo(p1, p2);
    /* method */ System.Collections.ICollection.get_IsSynchronized();
    /* method */ System.Collections.ICollection.get_SyncRoot();
    /* method */ get_Count();
    /* method */ GetEnumerator();
}
```

## LabelData  (token 0x02000130)

```csharp
class LabelData
{
    /* field */ addr;
    /* field */ maxStack;
}
```

## LabelFixup  (token 0x0200012f)

```csharp
class LabelFixup
{
    /* field */ offset;
    /* field */ pos;
    /* field */ label_idx;
}
```

## LayoutCache  (token 0x0200000c)

```csharp
class LayoutCache
{
    /* field */ topLevel;
    /* field */ layoutGroups;
    /* field */ windows;
    /* method */ .ctor();
}
```

## LegacyAnimationUpdate  (token 0x0200008f)

```csharp
class LegacyAnimationUpdate
{
}
```

## LegacyFixedAnimationUpdate  (token 0x02000075)

```csharp
class LegacyFixedAnimationUpdate
{
}
```

## LightmapMixedBakeMode  (token 0x02000143)

```csharp
class LightmapMixedBakeMode
{
    /* field */ value__;
    /* field */ None;
    /* field */ IndirectOnly;
    /* field */ Subtractive;
    /* field */ Shadowmask;
}
```

## LineType  (token 0x0200005c)

```csharp
class LineType
{
    /* field */ value__;
    /* field */ SingleLine;
    /* field */ MultiLineSubmit;
    /* field */ MultiLineNewline;
}
```

## Link  (token 0x0200006e)

```csharp
class Link
{
    /* field */ base_addr;
    /* field */ offset_addr;
}
```

## Link  (token 0x02000008)

```csharp
class Link
{
    /* field */ HashCode;
    /* field */ Next;
}
```

## LoadSplash  (token 0x02000051)

```csharp
class LoadSplash
{
    /* field */ splashIndex;
    /* field */ loaded;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ .cctor();
}
```

## Locale  (token 0x02000058)

```csharp
class Locale
{
    /* method */ GetText(p1);
    /* method */ GetText(p1, p2);
}
```

## Locale  (token 0x02000002)

```csharp
class Locale
{
    /* method */ GetText(p1);
}
```

## Locale  (token 0x02000002)

```csharp
class Locale
{
    /* method */ GetText(p1);
    /* method */ GetText(p1, p2);
}
```

## Locale  (token 0x02000003)

```csharp
class Locale
{
    /* method */ GetText(p1);
    /* method */ GetText(p1, p2);
}
```

## LogCallback  (token 0x02000004)

```csharp
class LogCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## LongComparer  (token 0x02000322)

```csharp
class LongComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## LowMemoryCallback  (token 0x02000003)

```csharp
class LowMemoryCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## MainMenu  (token 0x0200001a)

```csharp
class MainMenu
{
    /* field */ musicObj;
    /* field */ loaded;
    /* field */ titleAnimator;
    /* field */ explosions;
    /* field */ player;
    /* field */ playerHolder;
    /* field */ playerGuns;
    /* field */ gunRotations;
    /* field */ gunTime;
    /* field */ rocket;
    /* field */ cameraSpots;
    /* field */ camSpeed;
    /* field */ curStage;
    /* field */ inflationPoint;
    /* field */ mc;
    /* field */ lastMc;
    /* field */ animationTime;
    /* field */ cam;
    /* field */ background;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ UpdateCharacter(p1);
    /* method */ Update();
    /* method */ SetPlayers(p1);
    /* method */ PlayGame();
    /* method */ BuyCharacter();
    /* method */ SetMenuStage(p1);
    /* method */ FinishImplosion();
    /* method */ SetCamera();
    /* method */ updateGuns();
    /* method */ StatCheck();
    /* method */ CreateMusic();
    /* method */ SetBots(p1);
    /* method */ OpenURL(p1);
}
```

## MatEntry  (token 0x0200007c)

```csharp
class MatEntry
{
    /* field */ baseMat;
    /* field */ customMat;
    /* field */ count;
    /* field */ stencilId;
    /* field */ operation;
    /* field */ compareFunction;
    /* field */ readMask;
    /* field */ writeMask;
    /* field */ useAlphaClip;
    /* field */ colorMask;
    /* method */ .ctor();
}
```

## Medkit  (token 0x0200002a)

```csharp
class Medkit
{
    /* field */ healthIncrease;
    /* field */ healthParticles;
    /* method */ .ctor();
    /* method */ Use();
}
```

## MemoryFrameMaintenance  (token 0x020000bc)

```csharp
class MemoryFrameMaintenance
{
}
```

## MenuCamera  (token 0x0200001b)

```csharp
class MenuCamera
{
    /* field */ cameraSize;
    /* field */ curveFactor;
    /* field */ moveSpeed;
    /* method */ .ctor();
}
```

## MenuSettings  (token 0x0200001c)

```csharp
class MenuSettings
{
    /* field */ playToText;
    /* field */ playToNumb;
    /* field */ curPlayTo;
    /* field */ difficultyText;
    /* field */ difficultyNames;
    /* field */ curdifficulty;
    /* field */ turnSlider;
    /* field */ musicToggle;
    /* field */ soundEffectsToggle;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ ChangeCurPlayTo();
    /* method */ ChangeCurDiff();
    /* method */ ChangeTurnSensitivity();
    /* method */ ChangeMusicToggle();
    /* method */ ChangeSoundEffectsToggle();
    /* method */ ChangeNumberValue(p1, p2, p3, p4, p5);
    /* method */ ChangeStringValue(p1, p2, p3, p4);
    /* method */ UpdateTextValue(p1, p2);
    /* method */ UpdateSlider(p1, p2);
    /* method */ UpdateToggle(p1, p2);
    /* method */ OpenWebsite(p1);
    /* method */ .cctor();
}
```

## MessageEvent  (token 0x02000138)

```csharp
class MessageEvent
{
    /* method */ .ctor();
}
```

## MessageTypeSubscribers  (token 0x0200013a)

```csharp
class MessageTypeSubscribers
{
    /* field */ m_messageTypeId;
    /* field */ subscriberCount;
    /* field */ messageCallback;
    /* method */ .ctor();
    /* method */ get_MessageTypeId();
    /* method */ set_MessageTypeId(p1);
}
```

## Mode  (token 0x02000074)

```csharp
class Mode
{
    /* field */ value__;
    /* field */ Search;
    /* field */ Match;
    /* field */ Count;
}
```

## Mode  (token 0x02000067)

```csharp
class Mode
{
    /* field */ value__;
    /* field */ None;
    /* field */ Horizontal;
    /* field */ Vertical;
    /* field */ Automatic;
    /* field */ Explicit;
}
```

## ModulusRing  (token 0x02000073)

```csharp
class ModulusRing
{
    /* field */ mod;
    /* field */ constant;
    /* method */ .ctor(p1);
    /* method */ BarrettReduction(p1);
    /* method */ Multiply(p1, p2);
    /* method */ Difference(p1, p2);
    /* method */ Pow(p1, p2);
    /* method */ Pow(p1, p2);
}
```

## ModulusRing  (token 0x02000005)

```csharp
class ModulusRing
{
    /* field */ mod;
    /* field */ constant;
    /* method */ .ctor(p1);
    /* method */ BarrettReduction(p1);
    /* method */ Multiply(p1, p2);
    /* method */ Difference(p1, p2);
    /* method */ Pow(p1, p2);
    /* method */ Pow(p1, p2);
}
```

## MouseButtonEventData  (token 0x0200002b)

```csharp
class MouseButtonEventData
{
    /* field */ buttonState;
    /* field */ buttonData;
    /* method */ .ctor();
    /* method */ PressedThisFrame();
    /* method */ ReleasedThisFrame();
}
```

## MouseState  (token 0x0200002a)

```csharp
class MouseState
{
    /* field */ m_TrackedButtons;
    /* method */ .ctor();
    /* method */ AnyPressesThisFrame();
    /* method */ AnyReleasesThisFrame();
    /* method */ GetButtonState(p1);
    /* method */ SetButtonState(p1, p2, p3);
}
```

## MovementType  (token 0x0200006f)

```csharp
class MovementType
{
    /* field */ value__;
    /* field */ Unrestricted;
    /* field */ Elastic;
    /* field */ Clamped;
}
```

## MovingForeground  (token 0x0200001d)

```csharp
class MovingForeground
{
    /* field */ moveSpeed;
    /* field */ repeatX;
    /* field */ destroyableStartObjs;
    /* field */ cameraStartSpot;
    /* field */ firstRepeat;
    /* field */ startX;
    /* field */ paralaxes;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ SetCam();
    /* method */ FixedUpdate();
}
```

## NewInputBeginFixedUpdate  (token 0x0200007c)

```csharp
class NewInputBeginFixedUpdate
{
}
```

## NewInputBeginFrame  (token 0x0200006b)

```csharp
class NewInputBeginFrame
{
}
```

## NewInputEndFixedUpdate  (token 0x0200007d)

```csharp
class NewInputEndFixedUpdate
{
}
```

## NewInputUpdate  (token 0x02000087)

```csharp
class NewInputUpdate
{
}
```

## Node  (token 0x02000066)

```csharp
class Node
{
    /* field */ value;
    /* field */ previous;
    /* field */ next;
    /* method */ .ctor(p1);
}
```

## NullStreamReader  (token 0x02000115)

```csharp
class NullStreamReader
{
    /* method */ .ctor();
    /* method */ Peek();
    /* method */ Read();
    /* method */ Read(p1, p2, p3);
    /* method */ ReadLine();
    /* method */ ReadToEnd();
}
```

## NullTextReader  (token 0x02000119)

```csharp
class NullTextReader
{
    /* method */ .ctor();
    /* method */ ReadLine();
}
```

## NullTextWriter  (token 0x0200011c)

```csharp
class NullTextWriter
{
    /* method */ .ctor();
    /* method */ Write(p1);
    /* method */ Write(p1);
    /* method */ Write(p1, p2, p3);
}
```

## OnChangeEvent  (token 0x0200005f)

```csharp
class OnChangeEvent
{
    /* method */ .ctor();
}
```

## OnOverrideControllerDirtyCallback  (token 0x02000011)

```csharp
class OnOverrideControllerDirtyCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## OnTrigger  (token 0x02000016)

```csharp
class OnTrigger
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## OnValidateInput  (token 0x0200005d)

```csharp
class OnValidateInput
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## OptionData  (token 0x02000044)

```csharp
class OptionData
{
    /* field */ m_Text;
    /* field */ m_Image;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ .ctor(p1);
    /* method */ .ctor(p1, p2);
    /* method */ get_text();
    /* method */ set_text(p1);
    /* method */ get_image();
    /* method */ set_image(p1);
}
```

## OptionDataList  (token 0x02000045)

```csharp
class OptionDataList
{
    /* field */ m_Options;
    /* method */ .ctor();
    /* method */ get_options();
    /* method */ set_options(p1);
}
```

## OrderBlock  (token 0x02000016)

```csharp
class OrderBlock
{
    /* field */ order;
    /* field */ callback;
}
```

## Origin180  (token 0x02000054)

```csharp
class Origin180
{
    /* field */ value__;
    /* field */ Bottom;
    /* field */ Left;
    /* field */ Top;
    /* field */ Right;
}
```

## Origin360  (token 0x02000055)

```csharp
class Origin360
{
    /* field */ value__;
    /* field */ Bottom;
    /* field */ Right;
    /* field */ Top;
    /* field */ Left;
}
```

## Origin90  (token 0x02000053)

```csharp
class Origin90
{
    /* field */ value__;
    /* field */ BottomLeft;
    /* field */ TopLeft;
    /* field */ TopRight;
    /* field */ BottomRight;
}
```

## OriginHorizontal  (token 0x02000051)

```csharp
class OriginHorizontal
{
    /* field */ value__;
    /* field */ Left;
    /* field */ Right;
}
```

## OriginVertical  (token 0x02000052)

```csharp
class OriginVertical
{
    /* field */ value__;
    /* field */ Bottom;
    /* field */ Top;
}
```

## Paralax  (token 0x0200001e)

```csharp
class Paralax
{
    /* field */ amount;
    /* field */ target;
    /* field */ repeatX;
    /* field */ playerID;
    /* field */ bias;
    /* field */ startPos;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ LateUpdate();
    /* method */ SetTarget();
}
```

## ParticlesLegacyUpdateAllParticleSystems  (token 0x020000a2)

```csharp
class ParticlesLegacyUpdateAllParticleSystems
{
}
```

## ParticleSystemBeginUpdateAll  (token 0x02000096)

```csharp
class ParticleSystemBeginUpdateAll
{
}
```

## ParticleSystemEndUpdateAll  (token 0x020000a3)

```csharp
class ParticleSystemEndUpdateAll
{
}
```

## ParticleTrigger  (token 0x0200001f)

```csharp
class ParticleTrigger
{
    /* field */ particle;
    /* method */ .ctor();
    /* method */ Hit();
}
```

## PatternLinkStack  (token 0x0200006d)

```csharp
class PatternLinkStack
{
    /* field */ link;
    /* method */ .ctor();
    /* method */ set_BaseAddress(p1);
    /* method */ get_OffsetAddress();
    /* method */ set_OffsetAddress(p1);
    /* method */ GetOffset(p1);
    /* method */ GetCurrent();
    /* method */ SetCurrent(p1);
}
```

## PCMReaderCallback  (token 0x02000011)

```csharp
class PCMReaderCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## PCMSetPositionCallback  (token 0x02000012)

```csharp
class PCMSetPositionCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## PerformanceAnalyticsUpdate  (token 0x0200006e)

```csharp
class PerformanceAnalyticsUpdate
{
}
```

## Physics2DFixedUpdate  (token 0x02000078)

```csharp
class Physics2DFixedUpdate
{
}
```

## Physics2DUpdate  (token 0x02000080)

```csharp
class Physics2DUpdate
{
}
```

## PhysicsFixedUpdate  (token 0x02000077)

```csharp
class PhysicsFixedUpdate
{
}
```

## PhysicsResetInterpolatedTransformPosition  (token 0x0200006a)

```csharp
class PhysicsResetInterpolatedTransformPosition
{
}
```

## PhysicsSkinnedClothBeginUpdate  (token 0x020000c0)

```csharp
class PhysicsSkinnedClothBeginUpdate
{
}
```

## PhysicsSkinnedClothFinishUpdate  (token 0x020000c1)

```csharp
class PhysicsSkinnedClothFinishUpdate
{
}
```

## PhysicsUpdate  (token 0x0200007f)

```csharp
class PhysicsUpdate
{
}
```

## PhysicsWeapon  (token 0x0200002b)

```csharp
class PhysicsWeapon
{
    /* field */ projectile;
    /* field */ power;
    /* field */ inheritVelocity;
    /* field */ shootPos;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Use();
}
```

## PlayAnimation  (token 0x02000020)

```csharp
class PlayAnimation
{
    /* field */ animations;
    /* field */ startTriggerName;
    /* field */ stopTriggerName;
    /* method */ .ctor();
    /* method */ Play();
    /* method */ Stop();
}
```

## PlayerCleanupCachedData  (token 0x0200005f)

```csharp
class PlayerCleanupCachedData
{
}
```

## PlayerEmitCanvasGeometry  (token 0x020000ad)

```csharp
class PlayerEmitCanvasGeometry
{
}
```

## PlayerMovement  (token 0x02000021)

```csharp
class PlayerMovement
{
    /* field */ playerID;
    /* field */ health;
    /* field */ respawnTime;
    /* field */ realPlayer;
    /* field */ dead;
    /* field */ sheild;
    /* field */ jumpKeys;
    /* field */ raycastSpots;
    /* field */ bloodParticles;
    /* field */ jumpSound;
    /* field */ deathSound;
    /* field */ r;
    /* field */ gm;
    /* field */ pu;
    /* field */ gl;
    /* field */ upRight;
    /* field */ jumpTurns;
    /* field */ armPivot;
    /* field */ armPosition;
    /* field */ maxJumpPower;
    /* field */ maxJumpTurn;
    /* field */ turnSpeed;
    /* field */ lerpTurnSpeed;
    /* field */ turnUprightSpeed;
    /* field */ turnSensitivity;
    /* field */ timeRotating;
    /* field */ jumpTime;
    /* field */ jumpMaxVelocity;
    /* field */ ziplineTarget;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ LateUpdate();
    /* method */ UpdateTurn(p1);
    /* method */ Jump();
    /* method */ isGrounded();
    /* method */ OnCollisionStay2D(p1);
    /* method */ OnTriggerEnter2D(p1);
    /* method */ OnTriggerStay2D(p1);
    /* method */ Die();
    /* method */ Respawn();
    /* method */ SpawnBlood(p1, p2);
    /* method */ takeDamage(p1, p2, p3);
    /* method */ Zipline();
    /* method */ ResetZipline();
    /* method */ OnDestroy();
}
```

## PlayerPosUI  (token 0x02000046)

```csharp
class PlayerPosUI
{
    /* field */ playerUIHolder;
    /* field */ mapPlayerObj;
    /* field */ switchOrderMargin;
    /* field */ distanceBarSize;
    /* field */ wm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ UpdatePlayerPos(p1, p2);
    /* method */ checkImageOrder(p1);
}
```

## PlayerPowerUp  (token 0x02000022)

```csharp
class PlayerPowerUp
{
    /* field */ powerUpKey;
    /* field */ curPowerUp;
    /* field */ powerUpHolder;
    /* field */ armPivot;
    /* field */ targetRot;
    /* field */ curRot;
    /* field */ curTargetCheck;
    /* field */ curUse;
    /* field */ curCoolDown;
    /* field */ curPowerHealth;
    /* field */ players;
    /* field */ pum;
    /* field */ wm;
    /* field */ pm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ UsePowerUp();
    /* method */ DestroyObj();
    /* method */ ResetObj();
    /* method */ OnTriggerEnter2D(p1);
    /* method */ getPlayers();
    /* method */ DisablePowerUp();
    /* method */ clearCurPowerUp(p1);
}
```

## PlayerSendFrameComplete  (token 0x020000b0)

```csharp
class PlayerSendFrameComplete
{
}
```

## PlayerSendFramePostPresent  (token 0x020000bf)

```csharp
class PlayerSendFramePostPresent
{
}
```

## PlayerSendFrameStarted  (token 0x0200009a)

```csharp
class PlayerSendFrameStarted
{
}
```

## PlayerSpriteManager  (token 0x02000023)

```csharp
class PlayerSpriteManager
{
    /* field */ playerSprites;
    /* field */ armSprites;
    /* field */ headSprites;
    /* field */ characters;
    /* field */ categoryCounts;
    /* field */ categoryUnlockStart;
    /* field */ <>f__am$cache0;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ UpdateCharcters();
    /* method */ SortCharacters();
    /* method */ getRandomCharacter(p1);
    /* method */ getCharacter(p1);
    /* method */ PlayerIDToCharacterID(p1);
    /* method */ .cctor();
    /* method */ <SortCharacters>m__0(p1);
}
```

## PlayerStats  (token 0x02000024)

```csharp
class PlayerStats
{
    /* field */ kills;
    /* field */ deaths;
    /* method */ .ctor();
    /* method */ Reset();
}
```

## PlayerUpdateCanvases  (token 0x0200009d)

```csharp
class PlayerUpdateCanvases
{
}
```

## PlayerUpdateTime  (token 0x02000047)

```csharp
class PlayerUpdateTime
{
}
```

## PlaySound  (token 0x02000025)

```csharp
class PlaySound
{
    /* field */ playOnEnable;
    /* method */ .ctor();
    /* method */ OnEnable();
    /* method */ Play();
}
```

## PollHtcsPlayerConnection  (token 0x0200004f)

```csharp
class PollHtcsPlayerConnection
{
}
```

## PollPlayerConnection  (token 0x0200004d)

```csharp
class PollPlayerConnection
{
}
```

## PowerUpBox  (token 0x02000026)

```csharp
class PowerUpBox
{
    /* field */ overrideItem;
    /* field */ rotateSpeed;
    /* field */ respawnTime;
    /* field */ pu;
    /* field */ deactive;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ GetPowerUp();
    /* method */ ResetPowerUp();
    /* method */ DeactivateObj();
    /* method */ RespawnObj();
}
```

## PowerUpItem  (token 0x02000019)

```csharp
class PowerUpItem
{
    /* field */ weapon;
    /* field */ powerUpObj;
    /* field */ offset;
    /* field */ lookAtTarget;
    /* field */ destroyable;
    /* field */ targetPlayersForward;
    /* field */ amountOfUses;
    /* field */ iconPerUse;
    /* field */ useIcon;
    /* field */ logIcon;
    /* field */ automatic;
    /* field */ coolDown;
    /* field */ deactivateOut;
    /* method */ .ctor();
}
```

## PowerUpManager  (token 0x02000027)

```csharp
class PowerUpManager
{
    /* field */ manager;
    /* field */ powerUps;
    /* field */ weapons;
    /* field */ logPowerUps;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ getPowerUpLogIcon(p1);
    /* method */ getRandomPowerUp();
    /* method */ getRandomWeapon();
    /* method */ getRandomItem();
}
```

## PowerUpMenu  (token 0x02000047)

```csharp
class PowerUpMenu
{
    /* field */ powerUpMenus;
    /* field */ powerUpObj;
    /* method */ .ctor();
    /* method */ SetUpPowerUp(p1, p2);
    /* method */ UsedPowerUp(p1, p2, p3);
    /* method */ DeactivatePowerUp(p1);
}
```

## PresentAfterDraw  (token 0x020000b2)

```csharp
class PresentAfterDraw
{
}
```

## PresentBeforeUpdate  (token 0x02000058)

```csharp
class PresentBeforeUpdate
{
}
```

## PreviousInfo  (token 0x02000068)

```csharp
class PreviousInfo
{
    /* field */ Code;
    /* field */ SortKey;
    /* method */ .ctor(p1);
}
```

## PrimeHelper  (token 0x0200000a)

```csharp
class PrimeHelper
{
    /* field */ primes_table;
    /* method */ .cctor();
    /* method */ TestPrime(p1);
    /* method */ CalcPrime(p1);
    /* method */ ToPrime(p1);
}
```

## PrivateKeyInfo  (token 0x0200007e)

```csharp
class PrivateKeyInfo
{
    /* field */ _version;
    /* field */ _algorithm;
    /* field */ _key;
    /* field */ _list;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_PrivateKey();
    /* method */ Decode(p1);
    /* method */ RemoveLeadingZero(p1);
    /* method */ Normalize(p1, p2);
    /* method */ DecodeRSA(p1);
    /* method */ DecodeDSA(p1, p2);
}
```

## PrivateKeyInfo  (token 0x0200001a)

```csharp
class PrivateKeyInfo
{
    /* field */ _version;
    /* field */ _algorithm;
    /* field */ _key;
    /* field */ _list;
    /* method */ .ctor();
    /* method */ .ctor(p1);
    /* method */ get_PrivateKey();
    /* method */ Decode(p1);
    /* method */ RemoveLeadingZero(p1);
    /* method */ Normalize(p1, p2);
    /* method */ DecodeRSA(p1);
    /* method */ DecodeDSA(p1, p2);
}
```

## ProcessMouseInWindow  (token 0x02000055)

```csharp
class ProcessMouseInWindow
{
}
```

## ProcessRemoteInput  (token 0x02000063)

```csharp
class ProcessRemoteInput
{
}
```

## ProcessWebSendMessages  (token 0x020000a9)

```csharp
class ProcessWebSendMessages
{
}
```

## ProfilerEndFrame  (token 0x020000be)

```csharp
class ProfilerEndFrame
{
}
```

## ProfilerStartFrame  (token 0x0200004e)

```csharp
class ProfilerStartFrame
{
}
```

## ProfilerSynchronizeStats  (token 0x020000bb)

```csharp
class ProfilerSynchronizeStats
{
}
```

## PropertyType  (token 0x0200000b)

```csharp
class PropertyType
{
    /* field */ value__;
    /* field */ Disabled;
    /* field */ Static;
    /* field */ Dynamic;
}
```

## PushButton  (token 0x02000048)

```csharp
class PushButton
{
    /* field */ s;
    /* field */ t;
    /* field */ targetChild;
    /* field */ pushDist;
    /* field */ affectImageSize;
    /* field */ playSound;
    /* field */ soundClip;
    /* field */ aud;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnPointerDown(p1);
    /* method */ OnPointerUp(p1);
    /* method */ Down();
    /* method */ Up();
}
```

## Raycast2DCallback  (token 0x020000a5)

```csharp
class Raycast2DCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1);
}
```

## Raycast3DCallback  (token 0x020000a4)

```csharp
class Raycast3DCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1, p2);
}
```

## RaycastAllCallback  (token 0x020000a6)

```csharp
class RaycastAllCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## ReadDelegate  (token 0x02000103)

```csharp
class ReadDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## ReadOnlyArrayListWrapper  (token 0x020000b9)

```csharp
class ReadOnlyArrayListWrapper
{
    /* method */ .ctor(p1);
    /* method */ get_ErrorMessage();
    /* method */ get_IsReadOnly();
    /* method */ get_Item(p1);
    /* method */ set_Item(p1, p2);
    /* method */ Sort();
    /* method */ Sort(p1);
}
```

## ReadyUp  (token 0x0200002f)

```csharp
class ReadyUp
{
    /* field */ ready;
    /* field */ playerOneButtons;
    /* field */ playerTwoButtons;
    /* field */ t;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ CheckReady();
    /* method */ AllReady();
}
```

## ReapplyDrivenProperties  (token 0x02000174)

```csharp
class ReapplyDrivenProperties
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## ReceiveRecordAsyncResult  (token 0x0200004c)

```csharp
class ReceiveRecordAsyncResult
{
    /* field */ locker;
    /* field */ _userCallback;
    /* field */ _userState;
    /* field */ _asyncException;
    /* field */ handle;
    /* field */ _resultingBuffer;
    /* field */ _record;
    /* field */ completed;
    /* field */ _initialBuffer;
    /* method */ .ctor(p1, p2, p3, p4);
    /* method */ get_Record();
    /* method */ get_ResultingBuffer();
    /* method */ get_InitialBuffer();
    /* method */ get_AsyncState();
    /* method */ get_AsyncException();
    /* method */ get_CompletedWithError();
    /* method */ get_AsyncWaitHandle();
    /* method */ get_IsCompleted();
    /* method */ SetComplete(p1, p2);
    /* method */ SetComplete(p1);
    /* method */ SetComplete(p1);
}
```

## ReflectionProbeSupportFlags  (token 0x02000142)

```csharp
class ReflectionProbeSupportFlags
{
    /* field */ value__;
    /* field */ None;
    /* field */ Rotation;
}
```

## RendererNotifyInvisible  (token 0x0200005e)

```csharp
class RendererNotifyInvisible
{
}
```

## RepeatContext  (token 0x02000073)

```csharp
class RepeatContext
{
    /* field */ start;
    /* field */ min;
    /* field */ max;
    /* field */ lazy;
    /* field */ expr_pc;
    /* field */ previous;
    /* field */ count;
    /* method */ .ctor(p1, p2, p3, p4, p5);
    /* method */ get_Count();
    /* method */ set_Count(p1);
    /* method */ get_Start();
    /* method */ set_Start(p1);
    /* method */ get_IsMinimum();
    /* method */ get_IsMaximum();
    /* method */ get_IsLazy();
    /* method */ get_Expression();
    /* method */ get_Previous();
}
```

## RequestAtlasCallback  (token 0x02000178)

```csharp
class RequestAtlasCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## RequirementType  (token 0x02000005)

```csharp
class RequirementType
{
    /* field */ value__;
    /* field */ None;
    /* field */ Required;
    /* field */ Optional;
}
```

## ResetFrameStatsAfterPresent  (token 0x02000059)

```csharp
class ResetFrameStatsAfterPresent
{
}
```

## ResetInputAxis  (token 0x020000b9)

```csharp
class ResetInputAxis
{
}
```

## ResolveEventHolder  (token 0x02000140)

```csharp
class ResolveEventHolder
{
    /* method */ .ctor();
}
```

## ResourceCacheItem  (token 0x02000185)

```csharp
class ResourceCacheItem
{
    /* field */ ResourceName;
    /* field */ ResourceValue;
    /* method */ .ctor(p1, p2);
}
```

## ResourceEnumerator  (token 0x02000186)

```csharp
class ResourceEnumerator
{
    /* field */ reader;
    /* field */ index;
    /* field */ finished;
    /* method */ .ctor(p1);
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ FillCache();
}
```

## ResourceInfo  (token 0x02000184)

```csharp
class ResourceInfo
{
    /* field */ ValuePosition;
    /* field */ ResourceName;
    /* field */ TypeIndex;
    /* method */ .ctor(p1, p2, p3);
}
```

## Resources  (token 0x02000041)

```csharp
class Resources
{
    /* field */ standard;
    /* field */ background;
    /* field */ inputField;
    /* field */ knob;
    /* field */ checkmark;
    /* field */ dropdown;
    /* field */ mask;
}
```

## SampleFramesHandler  (token 0x0200000d)

```csharp
class SampleFramesHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## SampleType  (token 0x02000007)

```csharp
class SampleType
{
    /* field */ value__;
    /* field */ Layout;
    /* field */ Render;
}
```

## SByteComparer  (token 0x0200031f)

```csharp
class SByteComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## ScaleMode  (token 0x0200008a)

```csharp
class ScaleMode
{
    /* field */ value__;
    /* field */ ConstantPixelSize;
    /* field */ ScaleWithScreenSize;
    /* field */ ConstantPhysicalSize;
}
```

## Scheduler  (token 0x020002fc)

```csharp
class Scheduler
{
    /* field */ instance;
    /* field */ list;
    /* method */ .ctor();
    /* method */ .cctor();
    /* method */ get_Instance();
    /* method */ Remove(p1);
    /* method */ Change(p1, p2);
    /* method */ Add(p1);
    /* method */ InternalRemove(p1);
    /* method */ SchedulerThread();
    /* method */ ShrinkIfNeeded(p1, p2);
}
```

## Scoreboard  (token 0x02000030)

```csharp
class Scoreboard
{
    /* field */ scoreObj;
    /* field */ gm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ CreateScoreboard();
    /* method */ UpdateScore();
}
```

## ScreenMatchMode  (token 0x0200008b)

```csharp
class ScreenMatchMode
{
    /* field */ value__;
    /* field */ MatchWidthOrHeight;
    /* field */ Expand;
    /* field */ Shrink;
}
```

## ScriptRunBehaviourFixedUpdate  (token 0x02000073)

```csharp
class ScriptRunBehaviourFixedUpdate
{
}
```

## ScriptRunBehaviourLateUpdate  (token 0x02000097)

```csharp
class ScriptRunBehaviourLateUpdate
{
}
```

## ScriptRunBehaviourUpdate  (token 0x02000089)

```csharp
class ScriptRunBehaviourUpdate
{
}
```

## ScriptRunDelayedDynamicFrameRate  (token 0x0200008b)

```csharp
class ScriptRunDelayedDynamicFrameRate
{
}
```

## ScriptRunDelayedDynamicFrameRate  (token 0x020000a1)

```csharp
class ScriptRunDelayedDynamicFrameRate
{
}
```

## ScriptRunDelayedFixedFrameRate  (token 0x0200007a)

```csharp
class ScriptRunDelayedFixedFrameRate
{
}
```

## ScriptRunDelayedStartupFrame  (token 0x02000065)

```csharp
class ScriptRunDelayedStartupFrame
{
}
```

## ScriptRunDelayedTasks  (token 0x0200007b)

```csharp
class ScriptRunDelayedTasks
{
}
```

## ScrollbarVisibility  (token 0x02000070)

```csharp
class ScrollbarVisibility
{
    /* field */ value__;
    /* field */ Permanent;
    /* field */ AutoHide;
    /* field */ AutoHideAndExpandViewport;
}
```

## ScrollEvent  (token 0x0200006c)

```csharp
class ScrollEvent
{
    /* method */ .ctor();
}
```

## ScrollRectEvent  (token 0x02000071)

```csharp
class ScrollRectEvent
{
    /* method */ .ctor();
}
```

## SecurityAttribute  (token 0x020002c4)

```csharp
class SecurityAttribute
{
    /* field */ _name;
    /* field */ _value;
    /* method */ .ctor(p1, p2);
    /* method */ get_Name();
    /* method */ get_Value();
}
```

## SelectController  (token 0x02000031)

```csharp
class SelectController
{
    /* field */ leftKeys;
    /* field */ rightKeys;
    /* field */ submitKeys;
    /* field */ updatingKey;
    /* field */ character;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ UpdateDirection();
    /* method */ updateKey(p1, p2);
}
```

## SelectionState  (token 0x02000074)

```csharp
class SelectionState
{
    /* field */ value__;
    /* field */ Normal;
    /* field */ Highlighted;
    /* field */ Pressed;
    /* field */ Disabled;
}
```

## SendMouseEvents  (token 0x02000083)

```csharp
class SendMouseEvents
{
}
```

## SendRecordAsyncResult  (token 0x0200004d)

```csharp
class SendRecordAsyncResult
{
    /* field */ locker;
    /* field */ _userCallback;
    /* field */ _userState;
    /* field */ _asyncException;
    /* field */ handle;
    /* field */ _message;
    /* field */ completed;
    /* method */ .ctor(p1, p2, p3);
    /* method */ get_Message();
    /* method */ get_AsyncState();
    /* method */ get_AsyncException();
    /* method */ get_CompletedWithError();
    /* method */ get_AsyncWaitHandle();
    /* method */ get_IsCompleted();
    /* method */ SetComplete(p1);
    /* method */ SetComplete();
}
```

## SessionStateChanged  (token 0x02000004)

```csharp
class SessionStateChanged
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1);
}
```

## Settings  (token 0x02000032)

```csharp
class Settings
{
    /* field */ amountOfPlayers;
    /* field */ realPlayers;
    /* field */ playUpTo;
    /* field */ difficulty;
    /* field */ playerCharacters;
    /* field */ turnSensitivity;
    /* field */ music;
    /* field */ soundEffects;
    /* method */ .ctor();
    /* method */ .cctor();
}
```

## ShaderHandleErrors  (token 0x020000b8)

```csharp
class ShaderHandleErrors
{
}
```

## Sheild  (token 0x0200002c)

```csharp
class Sheild
{
    /* field */ useTime;
    /* field */ sheildSprite;
    /* field */ sheildObj;
    /* field */ pm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ Use();
    /* method */ Deactivate();
}
```

## ShimEnumerator  (token 0x020000a1)

```csharp
class ShimEnumerator
{
    /* field */ host_enumerator;
    /* method */ .ctor(p1);
    /* method */ MoveNext();
    /* method */ get_Entry();
    /* method */ get_Key();
    /* method */ get_Value();
    /* method */ get_Current();
    /* method */ Reset();
}
```

## ShortComparer  (token 0x02000320)

```csharp
class ShortComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## Sign  (token 0x02000072)

```csharp
class Sign
{
    /* field */ value__;
    /* field */ Negative;
    /* field */ Zero;
    /* field */ Positive;
}
```

## Sign  (token 0x02000004)

```csharp
class Sign
{
    /* field */ value__;
    /* field */ Negative;
    /* field */ Zero;
    /* field */ Positive;
}
```

## SimpleEnumerator  (token 0x0200002b)

```csharp
class SimpleEnumerator
{
    /* field */ enumeratee;
    /* field */ currentpos;
    /* field */ length;
    /* method */ .ctor(p1);
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
    /* method */ Clone();
}
```

## SimpleEnumerator  (token 0x020000b5)

```csharp
class SimpleEnumerator
{
    /* field */ list;
    /* field */ index;
    /* field */ version;
    /* field */ currentElement;
    /* field */ endFlag;
    /* method */ .ctor(p1);
    /* method */ .cctor();
    /* method */ Clone();
    /* method */ MoveNext();
    /* method */ get_Current();
    /* method */ Reset();
}
```

## SkinChangedDelegate  (token 0x0200000f)

```csharp
class SkinChangedDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## Sky  (token 0x02000034)

```csharp
class Sky
{
    /* field */ skyCategories;
    /* field */ tintColor;
    /* field */ amountOfViewers;
    /* field */ startX;
    /* field */ yRange;
    /* field */ totalWeights;
    /* field */ parlaxAmount;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Generate();
    /* method */ GenerateObj();
    /* method */ GetCategory();
    /* method */ GetPosition();
    /* method */ CreateHolder(p1);
}
```

## SliderEvent  (token 0x02000078)

```csharp
class SliderEvent
{
    /* method */ .ctor();
}
```

## Slot  (token 0x020000c3)

```csharp
class Slot
{
    /* field */ key;
    /* field */ value;
}
```

## Slot  (token 0x020000d0)

```csharp
class Slot
{
    /* field */ key;
    /* field */ value;
}
```

## SortingGroupsUpdate  (token 0x020000aa)

```csharp
class SortingGroupsUpdate
{
}
```

## SoundManager  (token 0x02000036)

```csharp
class SoundManager
{
    /* field */ levelEndSounds;
    /* field */ gm;
    /* field */ endSoundObj;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ getSoundObj(p1);
    /* method */ GameoverWrap();
}
```

## SoundOverlay  (token 0x02000037)

```csharp
class SoundOverlay
{
    /* field */ targetObj;
    /* field */ loadIndex;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnEnable();
    /* method */ Update();
    /* method */ OnDisable();
    /* method */ OnLevelFinishedLoading(p1, p2);
    /* method */ StartOverlay();
    /* method */ UpdateSoundObj();
}
```

## special  (token 0x02000017)

```csharp
class special
{
    /* field */ value__;
    /* field */ None;
    /* field */ Buy;
    /* field */ Twitter;
}
```

## SpecialFolder  (token 0x02000324)

```csharp
class SpecialFolder
{
    /* field */ value__;
    /* field */ MyDocuments;
    /* field */ Desktop;
    /* field */ MyComputer;
    /* field */ Programs;
    /* field */ Personal;
    /* field */ Favorites;
    /* field */ Startup;
    /* field */ Recent;
    /* field */ SendTo;
    /* field */ StartMenu;
    /* field */ MyMusic;
    /* field */ DesktopDirectory;
    /* field */ Templates;
    /* field */ ApplicationData;
    /* field */ LocalApplicationData;
    /* field */ InternetCache;
    /* field */ Cookies;
    /* field */ History;
    /* field */ CommonApplicationData;
    /* field */ System;
    /* field */ ProgramFiles;
    /* field */ MyPictures;
    /* field */ CommonProgramFiles;
}
```

## SPKey  (token 0x0200002a)

```csharp
class SPKey
{
    /* field */ uri;
    /* field */ use_connect;
    /* method */ .ctor(p1, p2);
    /* method */ GetHashCode();
    /* method */ Equals(p1);
}
```

## SplashAnimation  (token 0x02000052)

```csharp
class SplashAnimation
{
    /* field */ opacityTime;
    /* field */ startSize;
    /* field */ endSize;
    /* field */ increaseTime;
    /* field */ incTime;
    /* field */ opTime;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ loadMenu();
}
```

## SpriteAtlasManagerUpdate  (token 0x0200006c)

```csharp
class SpriteAtlasManagerUpdate
{
}
```

## StartPlayers  (token 0x02000038)

```csharp
class StartPlayers
{
    /* field */ path;
    /* field */ players;
    /* field */ startDelay;
    /* field */ playerInterval;
    /* field */ moveTimeLength;
    /* field */ playerSpacing;
    /* field */ exactPlayerStartTime;
    /* field */ playerPos;
    /* field */ startTime;
    /* field */ endDelayTime;
    /* field */ startObj;
    /* field */ startPos;
    /* field */ soundParent;
    /* field */ gm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ EnableSoundStart();
    /* method */ getSoundStartTime();
    /* method */ updatePlayers(p1);
    /* method */ SetPlayerPos(p1, p2);
    /* method */ quadraticCurve(p1, p2, p3, p4);
    /* method */ ActivatePlayers();
}
```

## StateChanged  (token 0x0200014f)

```csharp
class StateChanged
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## StaticGetter`1  (token 0x02000171)

```csharp
class StaticGetter`1
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## Status  (token 0x02000036)

```csharp
class Status
{
    /* field */ value__;
    /* field */ Visible;
    /* field */ Done;
    /* field */ Canceled;
    /* field */ LostFocus;
}
```

## StopSound  (token 0x02000039)

```csharp
class StopSound
{
    /* field */ stopOnEnable;
    /* method */ .ctor();
    /* method */ OnEnable();
    /* method */ Stop();
}
```

## SubmitEvent  (token 0x0200005e)

```csharp
class SubmitEvent
{
    /* method */ .ctor();
}
```

## Swapper  (token 0x0200002e)

```csharp
class Swapper
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## SyncHashtable  (token 0x020000c9)

```csharp
class SyncHashtable
{
    /* field */ host;
    /* method */ .ctor(p1);
    /* method */ .ctor(p1, p2);
    /* method */ System.Collections.IEnumerable.GetEnumerator();
    /* method */ get_Count();
    /* method */ get_IsSynchronized();
    /* method */ get_SyncRoot();
    /* method */ get_Keys();
    /* method */ get_Values();
    /* method */ get_Item(p1);
    /* method */ set_Item(p1, p2);
    /* method */ CopyTo(p1, p2);
    /* method */ Add(p1, p2);
    /* method */ Clear();
    /* method */ Contains(p1);
    /* method */ GetEnumerator();
    /* method */ Remove(p1);
    /* method */ ContainsKey(p1);
    /* method */ Clone();
}
```

## SynchronizedArrayListWrapper  (token 0x020000b7)

```csharp
class SynchronizedArrayListWrapper
{
    /* field */ m_SyncRoot;
    /* method */ .ctor(p1);
    /* method */ get_Item(p1);
    /* method */ set_Item(p1, p2);
    /* method */ get_Count();
    /* method */ get_Capacity();
    /* method */ set_Capacity(p1);
    /* method */ get_IsFixedSize();
    /* method */ get_IsReadOnly();
    /* method */ get_IsSynchronized();
    /* method */ get_SyncRoot();
    /* method */ Add(p1);
    /* method */ Clear();
    /* method */ Contains(p1);
    /* method */ IndexOf(p1);
    /* method */ IndexOf(p1, p2);
    /* method */ IndexOf(p1, p2, p3);
    /* method */ Insert(p1, p2);
    /* method */ InsertRange(p1, p2);
    /* method */ Remove(p1);
    /* method */ RemoveAt(p1);
    /* method */ CopyTo(p1);
    /* method */ CopyTo(p1, p2);
    /* method */ CopyTo(p1, p2, p3, p4);
    /* method */ GetEnumerator();
    /* method */ AddRange(p1);
    /* method */ Clone();
    /* method */ Sort();
    /* method */ Sort(p1);
    /* method */ ToArray();
    /* method */ ToArray(p1);
}
```

## SynchronizeInputs  (token 0x0200004a)

```csharp
class SynchronizeInputs
{
}
```

## SynchronizeState  (token 0x02000049)

```csharp
class SynchronizeState
{
}
```

## TableRange  (token 0x0200005e)

```csharp
class TableRange
{
    /* field */ Start;
    /* field */ End;
    /* field */ Count;
    /* field */ IndexStart;
    /* field */ IndexEnd;
    /* method */ .ctor(p1, p2, p3);
}
```

## TangoUpdate  (token 0x0200006d)

```csharp
class TangoUpdate
{
}
```

## TeleportGun  (token 0x0200002d)

```csharp
class TeleportGun
{
    /* field */ shootLine;
    /* field */ shotLength;
    /* field */ rigidbodyPower;
    /* field */ ourCollider;
    /* field */ sounds;
    /* method */ .ctor();
    /* method */ Use();
}
```

## TextFlash  (token 0x02000049)

```csharp
class TextFlash
{
    /* field */ flashTime;
    /* field */ flashMax;
    /* field */ a;
    /* field */ dir;
    /* field */ t;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## TextShadow  (token 0x0200004a)

```csharp
class TextShadow
{
    /* field */ addedShadow;
    /* method */ .ctor();
    /* method */ ApplyShadow();
}
```

## ThreadedLoadingDebug  (token 0x020000ba)

```csharp
class ThreadedLoadingDebug
{
}
```

## ThrowingKnife  (token 0x0200002e)

```csharp
class ThrowingKnife
{
    /* field */ weaponName;
    /* field */ healthDamage;
    /* field */ spin;
    /* field */ ourPlayer;
    /* field */ r;
    /* field */ startRot;
    /* field */ playerID;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnCollisionEnter2D(p1);
}
```

## TimerComparer  (token 0x020002fb)

```csharp
class TimerComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
}
```

## ToggleButton  (token 0x0200004b)

```csharp
class ToggleButton
{
    /* field */ toggled;
    /* field */ toggleColors;
    /* field */ outsideOutline;
    /* field */ t;
    /* field */ s;
    /* field */ img;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnPointerDown(p1);
    /* method */ UpdateButton(p1);
}
```

## ToggleEvent  (token 0x02000080)

```csharp
class ToggleEvent
{
    /* method */ .ctor();
}
```

## ToggleTransition  (token 0x0200007f)

```csharp
class ToggleTransition
{
    /* field */ value__;
    /* field */ None;
    /* field */ Fade;
}
```

## Transform`1  (token 0x020000a7)

```csharp
class Transform`1
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## Transition  (token 0x02000073)

```csharp
class Transition
{
    /* field */ value__;
    /* field */ None;
    /* field */ ColorTint;
    /* field */ SpriteSwap;
    /* field */ Animation;
}
```

## TransportationObj  (token 0x0200003a)

```csharp
class TransportationObj
{
    /* field */ safeTimeZone;
    /* field */ movingObj;
    /* field */ targetPos;
    /* field */ targetRot;
    /* field */ moveSpeed;
    /* field */ rotateLength;
    /* field */ curRot;
    /* field */ startRot;
    /* field */ previousMoveBehavior;
    /* field */ movingAnimations;
    /* field */ safeZoneObjs;
    /* field */ deactivateObjs;
    /* field */ moving;
    /* method */ .ctor();
    /* method */ FixedUpdate();
    /* method */ playerFinished();
    /* method */ SafeZone();
}
```

## Trigger  (token 0x0200000d)

```csharp
class Trigger
{
    /* field */ value__;
    /* field */ External;
    /* field */ Awake;
    /* field */ Start;
    /* field */ OnEnable;
    /* field */ OnDisable;
    /* field */ OnApplicationPause;
    /* field */ OnDestroy;
}
```

## TriggerEndOfFrameCallbacks  (token 0x020000c2)

```csharp
class TriggerEndOfFrameCallbacks
{
}
```

## TriggerEvent  (token 0x02000017)

```csharp
class TriggerEvent
{
    /* method */ .ctor();
}
```

## Tutorial  (token 0x0200003b)

```csharp
class Tutorial
{
    /* field */ animationTimes;
    /* field */ turnDir;
    /* field */ jumpDir;
    /* field */ deactive;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ EnableReadyUp();
    /* method */ StartAnimations();
    /* method */ TurnAnimation();
    /* method */ JumpAnimation();
    /* method */ PowerupAnimation();
}
```

## Type  (token 0x0200000a)

```csharp
class Type
{
    /* field */ value__;
    /* field */ fixedWidth;
    /* field */ fixedHeight;
    /* field */ minWidth;
    /* field */ maxWidth;
    /* field */ minHeight;
    /* field */ maxHeight;
    /* field */ stretchWidth;
    /* field */ stretchHeight;
    /* field */ alignStart;
    /* field */ alignMiddle;
    /* field */ alignEnd;
    /* field */ alignJustify;
    /* field */ equalSize;
    /* field */ spacing;
}
```

## Type  (token 0x0200004f)

```csharp
class Type
{
    /* field */ value__;
    /* field */ Simple;
    /* field */ Sliced;
    /* field */ Tiled;
    /* field */ Filled;
}
```

## TypeInfo  (token 0x0200022d)

```csharp
class TypeInfo
{
    /* field */ Attributes;
    /* field */ Elements;
    /* method */ .ctor();
}
```

## TypeMetadata  (token 0x0200023b)

```csharp
class TypeMetadata
{
    /* field */ Type;
    /* field */ MemberTypes;
    /* field */ MemberNames;
    /* field */ MemberInfos;
    /* field */ FieldCount;
    /* field */ NeedsSerializationInfo;
    /* method */ .ctor();
}
```

## UNetUpdate  (token 0x02000094)

```csharp
class UNetUpdate
{
}
```

## UnicodeDecoder  (token 0x020002e8)

```csharp
class UnicodeDecoder
{
    /* field */ bigEndian;
    /* field */ leftOverByte;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## Unit  (token 0x0200008c)

```csharp
class Unit
{
    /* field */ value__;
    /* field */ Centimeters;
    /* field */ Millimeters;
    /* field */ Inches;
    /* field */ Points;
    /* field */ Picas;
}
```

## UnityConnectClientUpdate  (token 0x02000051)

```csharp
class UnityConnectClientUpdate
{
}
```

## UnityWebRequestUpdate  (token 0x02000053)

```csharp
class UnityWebRequestUpdate
{
}
```

## UpdateAllRenderers  (token 0x020000a6)

```csharp
class UpdateAllRenderers
{
}
```

## UpdateAllSkinnedMeshes  (token 0x020000a8)

```csharp
class UpdateAllSkinnedMeshes
{
}
```

## UpdateAllUnityWebStreams  (token 0x0200005a)

```csharp
class UpdateAllUnityWebStreams
{
}
```

## UpdateAsyncReadbackManager  (token 0x0200005b)

```csharp
class UpdateAsyncReadbackManager
{
}
```

## UpdateAudio  (token 0x0200009e)

```csharp
class UpdateAudio
{
}
```

## UpdateCanvasRectTransform  (token 0x02000061)

```csharp
class UpdateCanvasRectTransform
{
}
```

## UpdateCanvasRectTransform  (token 0x0200009c)

```csharp
class UpdateCanvasRectTransform
{
}
```

## UpdateCaptureScreenshot  (token 0x020000b1)

```csharp
class UpdateCaptureScreenshot
{
}
```

## UpdateCustomRenderTextures  (token 0x020000a5)

```csharp
class UpdateCustomRenderTextures
{
}
```

## UpdatedEventHandler  (token 0x02000006)

```csharp
class UpdatedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## UpdateFunction  (token 0x020000c5)

```csharp
class UpdateFunction
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## UpdateInputManager  (token 0x02000062)

```csharp
class UpdateInputManager
{
}
```

## UpdateKinect  (token 0x02000066)

```csharp
class UpdateKinect
{
}
```

## UpdateMainGameViewRect  (token 0x02000060)

```csharp
class UpdateMainGameViewRect
{
}
```

## UpdateMasterServerInterface  (token 0x02000093)

```csharp
class UpdateMasterServerInterface
{
}
```

## UpdateNetworkManager  (token 0x02000092)

```csharp
class UpdateNetworkManager
{
}
```

## UpdatePreloading  (token 0x0200005d)

```csharp
class UpdatePreloading
{
}
```

## UpdateRectTransform  (token 0x0200009b)

```csharp
class UpdateRectTransform
{
}
```

## UpdateResolution  (token 0x020000b5)

```csharp
class UpdateResolution
{
}
```

## UpdateSubstance  (token 0x020000a4)

```csharp
class UpdateSubstance
{
}
```

## UpdateTextureStreamingManager  (token 0x0200005c)

```csharp
class UpdateTextureStreamingManager
{
}
```

## UpdateVideo  (token 0x02000086)

```csharp
class UpdateVideo
{
}
```

## UpdateVideo  (token 0x0200009f)

```csharp
class UpdateVideo
{
}
```

## UpdateVideoTextures  (token 0x020000ab)

```csharp
class UpdateVideoTextures
{
}
```

## UriScheme  (token 0x02000091)

```csharp
class UriScheme
{
    /* field */ scheme;
    /* field */ delimiter;
    /* field */ defaultPort;
    /* method */ .ctor(p1, p2, p3);
}
```

## URLManager  (token 0x0200004c)

```csharp
class URLManager
{
    /* method */ .ctor();
    /* method */ OpenLink(p1);
    /* method */ openWindow(p1);
}
```

## UTF32Decoder  (token 0x020002e2)

```csharp
class UTF32Decoder
{
    /* field */ bigEndian;
    /* field */ leftOverByte;
    /* field */ leftOverLength;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## UTF7Decoder  (token 0x020002e4)

```csharp
class UTF7Decoder
{
    /* field */ leftOver;
    /* method */ .ctor();
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## UTF8Decoder  (token 0x020002e6)

```csharp
class UTF8Decoder
{
    /* field */ leftOverBits;
    /* field */ leftOverCount;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## ValueCollection  (token 0x020000a5)

```csharp
class ValueCollection
{
    /* field */ dictionary;
    /* method */ .ctor(p1);
    /* method */ System.Collections.Generic.ICollection<TValue>.Add(p1);
    /* method */ System.Collections.Generic.ICollection<TValue>.Clear();
    /* method */ System.Collections.Generic.ICollection<TValue>.Contains(p1);
    /* method */ System.Collections.Generic.ICollection<TValue>.Remove(p1);
    /* method */ System.Collections.Generic.IEnumerable<TValue>.GetEnumerator();
    /* method */ System.Collections.ICollection.CopyTo(p1, p2);
    /* method */ System.Collections.IEnumerable.GetEnumerator();
    /* method */ System.Collections.Generic.ICollection<TValue>.get_IsReadOnly();
    /* method */ System.Collections.ICollection.get_IsSynchronized();
    /* method */ System.Collections.ICollection.get_SyncRoot();
    /* method */ CopyTo(p1, p2);
    /* method */ GetEnumerator();
    /* method */ get_Count();
}
```

## Waypoint  (token 0x0200004d)

```csharp
class Waypoint
{
    /* field */ spawnable;
    /* field */ x;
    /* field */ y;
    /* field */ bias;
    /* field */ movingParentObj;
    /* field */ movingNearbyDist;
    /* field */ parentDiff;
    /* field */ waitDir;
    /* field */ boxSize;
    /* field */ size;
    /* field */ offset;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ OnDrawGizmosSelected();
    /* method */ getSize();
}
```

## WaypointManager  (token 0x0200004e)

```csharp
class WaypointManager
{
    /* field */ players;
    /* field */ curPlayerWaypoints;
    /* field */ highestPlayerWaypoints;
    /* field */ distsToEnd;
    /* field */ waypoints;
    /* field */ waypointDists;
    /* field */ totalDist;
    /* field */ gm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ distToEnd(p1, p2, p3);
    /* method */ getCurrentWpos(p1);
    /* method */ getSpawnPos(p1);
    /* method */ checkPastWaypoint(p1, p2);
    /* method */ playerInWaypointZone(p1, p2);
    /* method */ inRangeOfNextWaypoint(p1);
    /* method */ getWaitingDirection(p1);
    /* method */ SwitchPlayers(p1, p2);
    /* method */ getPlayerDifference(p1, p2);
    /* method */ getOrderPlayers(p1);
    /* method */ <getOrderPlayers>m__0(p1);
}
```

## WeaponStats  (token 0x0200004f)

```csharp
class WeaponStats
{
    /* field */ Camos;
    /* field */ killsPerCamo;
    /* field */ upgradeCamoObj;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ addWeaponKill(p1);
    /* method */ getWeaponCamo(p1);
    /* method */ getRandomCamo();
}
```

## Which  (token 0x02000315)

```csharp
class Which
{
    /* field */ value__;
    /* field */ Day;
    /* field */ DayYear;
    /* field */ Month;
    /* field */ Year;
}
```

## WillRenderCanvases  (token 0x02000005)

```csharp
class WillRenderCanvases
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## WindowFunction  (token 0x02000006)

```csharp
class WindowFunction
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## WindUpdate  (token 0x02000085)

```csharp
class WindUpdate
{
}
```

## WorkRequest  (token 0x02000101)

```csharp
class WorkRequest
{
    /* field */ m_DelagateCallback;
    /* field */ m_DelagateState;
    /* field */ m_WaitHandle;
    /* method */ Invoke();
}
```

## WriteDelegate  (token 0x02000104)

```csharp
class WriteDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## X509CertificateEnumerator  (token 0x02000089)

```csharp
class X509CertificateEnumerator
{
    /* field */ enumerator;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.MoveNext();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## X509CertificateEnumerator  (token 0x02000025)

```csharp
class X509CertificateEnumerator
{
    /* field */ enumerator;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.MoveNext();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## X509CertificateEnumerator  (token 0x02000039)

```csharp
class X509CertificateEnumerator
{
    /* field */ enumerator;
    /* method */ .ctor(p1);
    /* method */ System.Collections.IEnumerator.get_Current();
    /* method */ System.Collections.IEnumerator.MoveNext();
    /* method */ System.Collections.IEnumerator.Reset();
    /* method */ get_Current();
    /* method */ MoveNext();
    /* method */ Reset();
}
```

## X509CrlEntry  (token 0x02000029)

```csharp
class X509CrlEntry
{
    /* field */ sn;
    /* field */ revocationDate;
    /* field */ extensions;
    /* method */ .ctor(p1);
    /* method */ get_SerialNumber();
    /* method */ get_RevocationDate();
    /* method */ get_Extensions();
}
```

## XREarlyUpdate  (token 0x0200004b)

```csharp
class XREarlyUpdate
{
}
```

## XRFixedUpdate  (token 0x02000076)

```csharp
class XRFixedUpdate
{
}
```

## XRPostPresent  (token 0x020000b4)

```csharp
class XRPostPresent
{
}
```

## XRUpdate  (token 0x02000064)

```csharp
class XRUpdate
{
}
```

## Zipline  (token 0x02000050)

```csharp
class Zipline
{
    /* field */ catchZone;
    /* field */ slope;
    /* field */ pos;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ CreateCollider(p1, p2, p3);
    /* method */ onLine(p1);
}
```
