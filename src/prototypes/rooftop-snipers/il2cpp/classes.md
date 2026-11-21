# Recovered class model (no-namespace / Assembly-CSharp scripts)

IL2CPP keeps compiled type and method names, so the shape of the original C# survives
even though every body became C++ and then asm.js. What is exact here: class names,
field names, method names, parameter counts, metadata tokens. What is not: field types
and method signatures (that needs the runtime Il2CppType table, which this export does
not expose) and bodies (the executable form is in `source/rooftop-snipers.code.js`).

302 types.

## _Item  (token 0x0200000b)

```csharp
class _Item
{
    /* field */ key;
    /* field */ value;
    /* method */ .ctor(p1, p2);
}
```

## _KeysEnumerator  (token 0x0200000c)

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

## $ArrayType$1024  (token 0x02000373)

```csharp
class $ArrayType$1024
{
}
```

## $ArrayType$1024  (token 0x02000016)

```csharp
class $ArrayType$1024
{
}
```

## $ArrayType$12  (token 0x0200036b)

```csharp
class $ArrayType$12
{
}
```

## $ArrayType$12  (token 0x02000099)

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

## $ArrayType$120  (token 0x02000365)

```csharp
class $ArrayType$120
{
}
```

## $ArrayType$120  (token 0x02000014)

```csharp
class $ArrayType$120
{
}
```

## $ArrayType$124  (token 0x0200036f)

```csharp
class $ArrayType$124
{
}
```

## $ArrayType$128  (token 0x02000375)

```csharp
class $ArrayType$128
{
}
```

## $ArrayType$128  (token 0x02000098)

```csharp
class $ArrayType$128
{
}
```

## $ArrayType$136  (token 0x0200036c)

```csharp
class $ArrayType$136
{
}
```

## $ArrayType$136  (token 0x02000013)

```csharp
class $ArrayType$136
{
}
```

## $ArrayType$16  (token 0x02000364)

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

## $ArrayType$20  (token 0x02000367)

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

## $ArrayType$2048  (token 0x02000371)

```csharp
class $ArrayType$2048
{
}
```

## $ArrayType$24  (token 0x02000363)

```csharp
class $ArrayType$24
{
}
```

## $ArrayType$256  (token 0x02000372)

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

## $ArrayType$256  (token 0x02000015)

```csharp
class $ArrayType$256
{
}
```

## $ArrayType$3132  (token 0x02000366)

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

## $ArrayType$32  (token 0x02000368)

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

## $ArrayType$48  (token 0x02000369)

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

## $ArrayType$52  (token 0x02000376)

```csharp
class $ArrayType$52
{
}
```

## $ArrayType$56  (token 0x02000362)

```csharp
class $ArrayType$56
{
}
```

## $ArrayType$64  (token 0x0200036a)

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

## $ArrayType$640  (token 0x02000374)

```csharp
class $ArrayType$640
{
}
```

## $ArrayType$72  (token 0x0200036e)

```csharp
class $ArrayType$72
{
}
```

## $ArrayType$8  (token 0x0200036d)

```csharp
class $ArrayType$8
{
}
```

## $ArrayType$96  (token 0x02000370)

```csharp
class $ArrayType$96
{
}
```

## AddEventAdapter  (token 0x0200014d)

```csharp
class AddEventAdapter
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## ArrayListWrapper  (token 0x020000b2)

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

## ArrayNullFiller  (token 0x0200022b)

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

## AspectMode  (token 0x0200008f)

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

## AttributeInfo  (token 0x02000329)

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

## AttrListImpl  (token 0x02000095)

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

## AudioConfigurationChangeHandler  (token 0x02000071)

```csharp
class AudioConfigurationChangeHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## Axis  (token 0x0200005b)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x02000073)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x02000080)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Axis  (token 0x02000098)

```csharp
class Axis
{
    /* field */ value__;
    /* field */ Horizontal;
    /* field */ Vertical;
}
```

## Billboard  (token 0x02000002)

```csharp
class Billboard
{
    /* field */ names;
    /* field */ endSymbol;
    /* field */ text;
    /* method */ .ctor();
    /* method */ Start();
}
```

## BitArrayEnumerator  (token 0x020000b7)

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

## BlockingObjects  (token 0x0200004f)

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

## ButtonClickedEvent  (token 0x0200003c)

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

## CallbackHandler  (token 0x02000245)

```csharp
class CallbackHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CameraCallback  (token 0x02000012)

```csharp
class CameraCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CameraFollow  (token 0x02000003)

```csharp
class CameraFollow
{
    /* field */ lerpSpeed;
    /* field */ targetPlayer;
    /* field */ players;
    /* field */ parallaxAmount;
    /* field */ playerPadding;
    /* field */ curLerpSpeed;
    /* field */ cameraSize;
    /* field */ curCameraSize;
    /* field */ screenCutOff;
    /* field */ gameView;
    /* field */ targetPos;
    /* field */ c;
    /* field */ parallax;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ FixedUpdate();
    /* method */ addPlayers(p1);
}
```

## Category  (token 0x0200000a)

```csharp
class Category
{
    /* field */ Name;
    /* field */ color;
    /* field */ Items;
    /* method */ .ctor();
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

## character  (token 0x02000020)

```csharp
class character
{
    /* field */ Name;
    /* field */ skinColor;
    /* field */ armColor;
    /* field */ characterFace;
    /* field */ characterBody;
    /* field */ characterLeg;
    /* field */ characterGun;
    /* field */ quotes;
    /* method */ .ctor();
}
```

## CharacterValidation  (token 0x0200005f)

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

## Clouds  (token 0x02000004)

```csharp
class Clouds
{
    /* field */ cloud;
    /* field */ cloudSpeed;
    /* field */ cloudTime;
    /* field */ cloudWaitTime;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ SpawnCloud(p1, p2);
    /* method */ generatedPosition(p1);
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

## Comment  (token 0x0200000f)

```csharp
class Comment
{
    /* field */ name;
    /* field */ layers;
    /* method */ .ctor();
}
```

## commentLayer  (token 0x02000010)

```csharp
class commentLayer
{
    /* field */ names;
    /* method */ .ctor();
}
```

## ComputerMovement  (token 0x02000005)

```csharp
class ComputerMovement
{
    /* field */ spawnPosX;
    /* field */ jump;
    /* field */ jumpWaitAmount;
    /* field */ jumpWaitTime;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## ConnectionChangeEvent  (token 0x02000123)

```csharp
class ConnectionChangeEvent
{
    /* method */ .ctor();
}
```

## Constraint  (token 0x02000099)

```csharp
class Constraint
{
    /* field */ value__;
    /* field */ Flexible;
    /* field */ FixedColumnCount;
    /* field */ FixedRowCount;
}
```

## ContentInfo  (token 0x0200008e)

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

## ContentType  (token 0x0200005d)

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

## Context  (token 0x02000065)

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

## Corner  (token 0x02000097)

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

## CostDelegate  (token 0x02000076)

```csharp
class CostDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## CullStateChangedEvent  (token 0x02000069)

```csharp
class CullStateChangedEvent
{
    /* method */ .ctor();
}
```

## CustomInfo  (token 0x02000333)

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

## Data  (token 0x020000ec)

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

## DblClickSnapping  (token 0x020000bd)

```csharp
class DblClickSnapping
{
    /* field */ value__;
    /* field */ WORDS;
    /* field */ PARAGRAPHS;
}
```

## DeathQuote  (token 0x02000006)

```csharp
class DeathQuote
{
    /* field */ quotes;
    /* field */ textObj;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ createDeathText(p1);
}
```

## DebuggingModes  (token 0x020000d4)

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

## Default  (token 0x02000144)

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

## DefaultComparer  (token 0x0200009b)

```csharp
class DefaultComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
}
```

## DefaultComparer  (token 0x020000a5)

```csharp
class DefaultComparer
{
    /* method */ .ctor();
    /* method */ GetHashCode(p1);
    /* method */ Equals(p1, p2);
}
```

## DelegateEntry  (token 0x02000307)

```csharp
class DelegateEntry
{
    /* field */ type;
    /* field */ assembly;
    /* field */ target;
    /* field */ targetTypeAssembly;
    /* field */ targetTypeName;
    /* field */ methodName;
    /* field */ delegateEntry;
    /* method */ .ctor(p1, p2);
    /* method */ DeserializeDelegate(p1);
}
```

## DeriveBytes  (token 0x02000083)

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

## DictionaryEnumerator  (token 0x020001f1)

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

## DictionaryNode  (token 0x02000008)

```csharp
class DictionaryNode
{
    /* field */ key;
    /* field */ value;
    /* field */ next;
    /* method */ .ctor(p1, p2, p3);
}
```

## DictionaryNodeEnumerator  (token 0x02000009)

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

## Direction  (token 0x02000071)

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

## Direction  (token 0x0200007e)

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

## DisableObj  (token 0x02000007)

```csharp
class DisableObj
{
    /* method */ .ctor();
    /* method */ Disable();
}
```

## DisplaysUpdatedDelegate  (token 0x0200001c)

```csharp
class DisplaysUpdatedDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## DropdownEvent  (token 0x02000048)

```csharp
class DropdownEvent
{
    /* method */ .ctor();
}
```

## DropdownItem  (token 0x02000045)

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

## DynamicPropertyReg  (token 0x020001c8)

```csharp
class DynamicPropertyReg
{
    /* field */ Property;
    /* field */ Sink;
    /* method */ .ctor();
}
```

## Edge  (token 0x0200005a)

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

## EditState  (token 0x02000064)

```csharp
class EditState
{
    /* field */ value__;
    /* field */ Continue;
    /* field */ Finish;
}
```

## EncryptedData  (token 0x0200008f)

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

## EncryptedPrivateKeyInfo  (token 0x0200007d)

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

## Entry  (token 0x02000018)

```csharp
class Entry
{
    /* field */ eventID;
    /* field */ callback;
    /* method */ .ctor();
}
```

## Enumerator  (token 0x020000a0)

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

## Enumerator  (token 0x020000a2)

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

## Enumerator  (token 0x020000ad)

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

## Enumerator  (token 0x020000c2)

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

## Enumerator  (token 0x020000ce)

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

## Enumerator  (token 0x020000d0)

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

## Enumerator  (token 0x02000059)

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

## Enumerator  (token 0x02000075)

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

## Enumerator  (token 0x02000055)

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

## EnumeratorMode  (token 0x020000c1)

```csharp
class EnumeratorMode
{
    /* field */ value__;
    /* field */ KEY_MODE;
    /* field */ VALUE_MODE;
    /* field */ ENTRY_MODE;
}
```

## EnumeratorMode  (token 0x020000cd)

```csharp
class EnumeratorMode
{
    /* field */ value__;
    /* field */ KEY_MODE;
    /* field */ VALUE_MODE;
    /* field */ ENTRY_MODE;
}
```

## Escape  (token 0x02000067)

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

## EvidenceEnumerator  (token 0x0200029c)

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

## ExtenderType  (token 0x02000068)

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

## FallingObjects  (token 0x02000008)

```csharp
class FallingObjects
{
    /* field */ obj;
    /* field */ objTime;
    /* field */ objWaitTime;
    /* field */ cameraPos;
    /* field */ totalObjCount;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ createObj(p1);
    /* method */ generatedPos();
}
```

## FavoriteMenu  (token 0x02000009)

```csharp
class FavoriteMenu
{
    /* field */ categorys;
    /* field */ descriptionWords;
    /* field */ ButtonObj;
    /* field */ ButtonItemObj;
    /* field */ customizationText;
    /* field */ curCategorys;
    /* field */ customizeName;
    /* method */ .ctor();
    /* method */ Awake();
    /* method */ changeCategory(p1);
    /* method */ updateName();
    /* method */ TweetIt();
    /* method */ saveFavorite();
}
```

## FillMethod  (token 0x02000054)

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

## FitMode  (token 0x02000095)

```csharp
class FitMode
{
    /* field */ value__;
    /* field */ Unconstrained;
    /* field */ MinSize;
    /* field */ PreferredSize;
}
```

## FixedSizeArrayListWrapper  (token 0x020000b4)

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

## Flags  (token 0x02000118)

```csharp
class Flags
{
    /* field */ value__;
    /* field */ Evaluate;
    /* field */ SeekOccured;
}
```

## FloatTweenCallback  (token 0x02000037)

```csharp
class FloatTweenCallback
{
    /* method */ .ctor();
}
```

## FontTextureRebuildCallback  (token 0x02000097)

```csharp
class FontTextureRebuildCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## ForwardingDecoder  (token 0x020002ca)

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

## GameInput  (token 0x0200000c)

```csharp
class GameInput
{
    /* field */ pauseMenu;
    /* field */ gameoverMenu;
    /* field */ gm;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ TimeScaleSwitch(p1);
}
```

## Gamemanager  (token 0x0200000d)

```csharp
class Gamemanager
{
    /* field */ player;
    /* field */ player2;
    /* field */ computer;
    /* field */ spwanPoints;
    /* field */ scoreText;
    /* field */ randomizerText;
    /* field */ Rain;
    /* field */ slipperyMat;
    /* field */ pointText;
    /* field */ matchPointText;
    /* field */ readyUpMenu;
    /* field */ playUpToText;
    /* field */ deathFlashAnim;
    /* field */ athleticShoe;
    /* field */ specialGuns;
    /* field */ pauseButton;
    /* field */ firstPlay;
    /* field */ avaliblePause;
    /* field */ playerScores;
    /* field */ players;
    /* field */ Cf;
    /* field */ roundOver;
    /* field */ randomizerNames;
    /* field */ randomizerTotal;
    /* field */ playerOneWonRound;
    /* field */ weapons;
    /* field */ maps;
    /* field */ fallingObj;
    /* field */ randomizerLengths;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ setRandomizerLengths();
    /* method */ setRandomizer();
    /* method */ createPlayers();
    /* method */ FirstPlay();
    /* method */ playNumberShow();
    /* method */ setWeapons(p1);
    /* method */ setMap(p1);
    /* method */ slippery(p1);
    /* method */ Athlete();
    /* method */ disablePlayers(p1);
    /* method */ RoundOver(p1);
    /* method */ wrapRound();
    /* method */ GameOver();
    /* method */ UpdateScores();
    /* method */ showPoint();
    /* method */ SetTimeScale(p1);
    /* method */ setLevel(p1);
    /* method */ Ready();
    /* method */ .cctor();
}
```

## GameoverMenu  (token 0x0200000e)

```csharp
class GameoverMenu
{
    /* field */ menu;
    /* field */ comments;
    /* field */ commentLayers;
    /* field */ colorOrder;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Gameover(p1);
    /* method */ declareArrays();
}
```

## GetRayIntersectionAllCallback  (token 0x020000af)

```csharp
class GetRayIntersectionAllCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## Getter`2  (token 0x02000164)

```csharp
class Getter`2
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## GetterAdapter  (token 0x02000163)

```csharp
class GetterAdapter
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## GuidParser  (token 0x02000319)

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

## HashKeys  (token 0x020000c3)

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

## HashValues  (token 0x020000c4)

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

## Health  (token 0x02000011)

```csharp
class Health
{
    /* field */ hitSound;
    /* method */ .ctor();
    /* method */ Hit();
}
```

## HitInfo  (token 0x020000df)

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

## IAttrList  (token 0x02000094)

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

## IContentHandler  (token 0x02000093)

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

## ImageAlpha  (token 0x02000012)

```csharp
class ImageAlpha
{
    /* field */ alpha;
    /* field */ c;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
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

## InputMode  (token 0x0200002d)

```csharp
class InputMode
{
    /* field */ value__;
    /* field */ Mouse;
    /* field */ Buttons;
}
```

## InputType  (token 0x0200005e)

```csharp
class InputType
{
    /* field */ value__;
    /* field */ Standard;
    /* field */ AutoCorrect;
    /* field */ Password;
}
```

## IntComparer  (token 0x0200030e)

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

## InternalShaderChannel  (token 0x02000035)

```csharp
class InternalShaderChannel
{
    /* field */ value__;
    /* field */ Vertex;
    /* field */ Normal;
    /* field */ Color;
    /* field */ TexCoord0;
    /* field */ TexCoord1;
    /* field */ TexCoord2;
    /* field */ TexCoord3;
    /* field */ Tangent;
}
```

## InternalVertexChannelType  (token 0x02000036)

```csharp
class InternalVertexChannelType
{
    /* field */ value__;
    /* field */ Float;
    /* field */ Color;
}
```

## IntStack  (token 0x02000070)

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

## Jump  (token 0x02000013)

```csharp
class Jump
{
    /* field */ jumpPower;
    /* field */ jumpSound;
    /* field */ r;
    /* field */ jumpCoolDown;
    /* field */ jumpTime;
    /* field */ raycastSpot;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ jump();
    /* method */ OnCollisionStay2D(p1);
    /* method */ isGrounded();
}
```

## Kernel  (token 0x02000072)

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

## Key  (token 0x02000062)

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

## KeyGeneratedEventHandler  (token 0x02000077)

```csharp
class KeyGeneratedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## KeyGeneratedEventHandler  (token 0x0200007f)

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

## KeyMarker  (token 0x020000c0)

```csharp
class KeyMarker
{
    /* field */ Removed;
    /* method */ .ctor();
    /* method */ .cctor();
}
```

## KeysCollection  (token 0x0200000d)

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

## KongregateAPIBehaviour  (token 0x02000014)

```csharp
class KongregateAPIBehaviour
{
    /* field */ instance;
    /* field */ active;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnKongregateAPILoaded(p1);
    /* method */ Score(p1, p2);
    /* method */ OnKongregateUserInfo(p1);
}
```

## LabelData  (token 0x02000126)

```csharp
class LabelData
{
    /* field */ addr;
    /* field */ maxStack;
}
```

## LabelFixup  (token 0x02000125)

```csharp
class LabelFixup
{
    /* field */ offset;
    /* field */ pos;
    /* field */ label_idx;
}
```

## LayoutCache  (token 0x020000af)

```csharp
class LayoutCache
{
    /* field */ topLevel;
    /* field */ layoutGroups;
    /* field */ windows;
    /* method */ .ctor();
}
```

## LineType  (token 0x02000060)

```csharp
class LineType
{
    /* field */ value__;
    /* field */ SingleLine;
    /* field */ MultiLineSubmit;
    /* field */ MultiLineNewline;
}
```

## Link  (token 0x0200006c)

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

## Locale  (token 0x02000056)

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

## LongComparer  (token 0x0200030f)

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

## MatEntry  (token 0x02000083)

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

## Menu  (token 0x02000015)

```csharp
class Menu
{
    /* field */ onePlayer;
    /* field */ soundObj;
    /* field */ song;
    /* field */ buttonSound;
    /* field */ fullScreenError;
    /* field */ targetSize;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ PlaySong();
    /* method */ buttonClick();
    /* method */ Play(p1);
    /* method */ AppStore();
    /* method */ NewEichGames();
    /* method */ FullScreen();
    /* method */ checkFullScreen();
    /* method */ disableError();
}
```

## MessageEvent  (token 0x02000122)

```csharp
class MessageEvent
{
    /* method */ .ctor();
}
```

## MessageTypeSubscribers  (token 0x02000124)

```csharp
class MessageTypeSubscribers
{
    /* field */ m_messageTypeId;
    /* field */ subscriberCount;
    /* field */ messageCallback;
    /* method */ .ctor();
    /* method */ get_MessageTypeId();
}
```

## Mode  (token 0x02000072)

```csharp
class Mode
{
    /* field */ value__;
    /* field */ Search;
    /* field */ Match;
    /* field */ Count;
}
```

## Mode  (token 0x0200006d)

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

## ModulusRing  (token 0x02000071)

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

## MovementType  (token 0x02000076)

```csharp
class MovementType
{
    /* field */ value__;
    /* field */ Unrestricted;
    /* field */ Elastic;
    /* field */ Clamped;
}
```

## Node  (token 0x02000064)

```csharp
class Node
{
    /* field */ value;
    /* field */ previous;
    /* field */ next;
    /* method */ .ctor(p1);
}
```

## NullStreamReader  (token 0x0200010f)

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

## NullTextReader  (token 0x02000113)

```csharp
class NullTextReader
{
    /* method */ .ctor();
    /* method */ ReadLine();
}
```

## NullTextWriter  (token 0x02000116)

```csharp
class NullTextWriter
{
    /* method */ .ctor();
    /* method */ Write(p1);
    /* method */ Write(p1);
    /* method */ Write(p1, p2, p3);
}
```

## OnChangeEvent  (token 0x02000063)

```csharp
class OnChangeEvent
{
    /* method */ .ctor();
}
```

## OnValidateInput  (token 0x02000061)

```csharp
class OnValidateInput
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## OptionData  (token 0x02000046)

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

## OptionDataList  (token 0x02000047)

```csharp
class OptionDataList
{
    /* field */ m_Options;
    /* method */ .ctor();
    /* method */ get_options();
    /* method */ set_options(p1);
}
```

## Origin180  (token 0x02000058)

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

## Origin360  (token 0x02000059)

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

## Origin90  (token 0x02000057)

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

## OriginHorizontal  (token 0x02000055)

```csharp
class OriginHorizontal
{
    /* field */ value__;
    /* field */ Left;
    /* field */ Right;
}
```

## OriginVertical  (token 0x02000056)

```csharp
class OriginVertical
{
    /* field */ value__;
    /* field */ Bottom;
    /* field */ Top;
}
```

## PatternLinkStack  (token 0x0200006b)

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

## PCMReaderCallback  (token 0x02000073)

```csharp
class PCMReaderCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## PCMSetPositionCallback  (token 0x02000074)

```csharp
class PCMSetPositionCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## PictureSign  (token 0x02000016)

```csharp
class PictureSign
{
    /* field */ signColors;
    /* field */ images;
    /* field */ rotations;
    /* method */ .ctor();
    /* method */ Start();
}
```

## Player  (token 0x02000018)

```csharp
class Player
{
    /* field */ id;
    /* field */ disableCompenents;
    /* field */ gunScript;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ Die();
    /* method */ changeScripts(p1);
}
```

## PlayerCollisions  (token 0x02000019)

```csharp
class PlayerCollisions
{
    /* field */ trashParticles;
    /* method */ .ctor();
    /* method */ OnTriggerEnter2D(p1);
    /* method */ OnCollisionEnter2D(p1);
}
```

## PlayerMovement  (token 0x0200001a)

```csharp
class PlayerMovement
{
    /* field */ jumpButton;
    /* field */ jump;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## PlaySound  (token 0x02000017)

```csharp
class PlaySound
{
    /* method */ .ctor();
    /* method */ Play();
}
```

## playUpTo  (token 0x02000022)

```csharp
class playUpTo
{
    /* field */ number;
    /* field */ name;
    /* method */ .ctor();
}
```

## PreviousInfo  (token 0x02000066)

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

## PrivateKeyInfo  (token 0x0200007c)

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

## PushButton  (token 0x0200001b)

```csharp
class PushButton
{
    /* field */ s;
    /* field */ t;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnPointerDown(p1);
    /* method */ OnPointerUp(p1);
}
```

## Raycast2DCallback  (token 0x020000ad)

```csharp
class Raycast2DCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1);
}
```

## Raycast3DCallback  (token 0x020000ac)

```csharp
class Raycast3DCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3, p4);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5, p6);
    /* method */ EndInvoke(p1, p2);
}
```

## RaycastAllCallback  (token 0x020000ae)

```csharp
class RaycastAllCallback
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## ReadDelegate  (token 0x020000fd)

```csharp
class ReadDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## ReadOnlyArrayListWrapper  (token 0x020000b5)

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

## ReadyUp  (token 0x0200001c)

```csharp
class ReadyUp
{
    /* field */ onePlayer;
    /* field */ playerButtons;
    /* field */ randomizerText;
    /* field */ readyUpKeys;
    /* field */ f;
    /* field */ playersReady;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ check();
    /* method */ AllReady();
}
```

## ReapplyDrivenProperties  (token 0x02000059)

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

## RepeatContext  (token 0x02000071)

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

## ResolveEventHolder  (token 0x02000134)

```csharp
class ResolveEventHolder
{
    /* method */ .ctor();
}
```

## ResourceCacheItem  (token 0x02000178)

```csharp
class ResourceCacheItem
{
    /* field */ ResourceName;
    /* field */ ResourceValue;
    /* method */ .ctor(p1, p2);
}
```

## ResourceEnumerator  (token 0x02000179)

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

## ResourceInfo  (token 0x02000177)

```csharp
class ResourceInfo
{
    /* field */ ValuePosition;
    /* field */ ResourceName;
    /* field */ TypeIndex;
    /* method */ .ctor(p1, p2, p3);
}
```

## Resources  (token 0x02000043)

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

## Rocket  (token 0x0200001d)

```csharp
class Rocket
{
    /* field */ rocketPower;
    /* field */ explosion;
    /* method */ .ctor();
    /* method */ OnCollisionEnter2D(p1);
}
```

## RocketLaucher  (token 0x0200001e)

```csharp
class RocketLaucher
{
    /* field */ rocket;
    /* field */ shotPower;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Shoot();
}
```

## SByteComparer  (token 0x0200030c)

```csharp
class SByteComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## ScaleMode  (token 0x02000091)

```csharp
class ScaleMode
{
    /* field */ value__;
    /* field */ ConstantPixelSize;
    /* field */ ScaleWithScreenSize;
    /* field */ ConstantPhysicalSize;
}
```

## Scheduler  (token 0x020002e7)

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

## ScreenMatchMode  (token 0x02000092)

```csharp
class ScreenMatchMode
{
    /* field */ value__;
    /* field */ MatchWidthOrHeight;
    /* field */ Expand;
    /* field */ Shrink;
}
```

## ScrollbarVisibility  (token 0x02000077)

```csharp
class ScrollbarVisibility
{
    /* field */ value__;
    /* field */ Permanent;
    /* field */ AutoHide;
    /* field */ AutoHideAndExpandViewport;
}
```

## ScrollEvent  (token 0x02000072)

```csharp
class ScrollEvent
{
    /* method */ .ctor();
}
```

## ScrollRectEvent  (token 0x02000078)

```csharp
class ScrollRectEvent
{
    /* method */ .ctor();
}
```

## SecurityAttribute  (token 0x020002b0)

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

## SelectionState  (token 0x0200007b)

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

## SetPlayers  (token 0x0200001f)

```csharp
class SetPlayers
{
    /* field */ characters;
    /* method */ .ctor();
    /* method */ applyPlayers(p1);
    /* method */ RandomCharacter(p1, p2);
}
```

## Settings  (token 0x02000021)

```csharp
class Settings
{
    /* field */ toggleColors;
    /* field */ playUpToAmounts;
    /* field */ playAmountText;
    /* field */ playAmount;
    /* field */ curPlayAmount;
    /* field */ playFavoriteCustomization;
    /* field */ playCustomizationButton;
    /* field */ mute;
    /* field */ muteButton;
    /* field */ deathQuotes;
    /* field */ quotesButton;
    /* field */ diffText;
    /* field */ difficulties;
    /* field */ curDifficulty;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ OnEnable();
    /* method */ increasePlayNumber();
    /* method */ PlayCustomization();
    /* method */ updateCustomizationColor();
    /* method */ Mute();
    /* method */ DeathQuotes();
    /* method */ UpdateQuoteButton();
    /* method */ changeDifficulty();
    /* method */ getAbsoluteDiff();
    /* method */ updateDiffText();
    /* method */ .cctor();
}
```

## ShimEnumerator  (token 0x0200009f)

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

## Shoot  (token 0x02000023)

```csharp
class Shoot
{
    /* field */ arm;
    /* field */ coolDownWait;
    /* field */ gunRaiseSpeed;
    /* field */ shootButton;
    /* field */ scale;
    /* field */ curCoolDown;
    /* field */ curGunRotaion;
    /* field */ kickBackAnim;
    /* field */ gun;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ shoot();
    /* method */ unfreezeArm();
}
```

## ShootAI  (token 0x02000024)

```csharp
class ShootAI
{
    /* field */ arm;
    /* field */ gunRaiseSpeed;
    /* field */ shootWait;
    /* field */ shootTime;
    /* field */ curGunRotaion;
    /* field */ neededGunRotation;
    /* field */ kickBackAnim;
    /* field */ gun;
    /* field */ player1;
    /* field */ absoluteDiff;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ shoot();
    /* method */ unfreezeArm();
    /* method */ getPlayerRotation();
}
```

## ShortComparer  (token 0x0200030d)

```csharp
class ShortComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
    /* method */ Compare(p1, p2);
}
```

## Sign  (token 0x02000070)

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

## SimpleEnumerator  (token 0x020000b1)

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

## SkinChangedDelegate  (token 0x020000b2)

```csharp
class SkinChangedDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## SliderEvent  (token 0x0200007f)

```csharp
class SliderEvent
{
    /* method */ .ctor();
}
```

## Slot  (token 0x020000bf)

```csharp
class Slot
{
    /* field */ key;
    /* field */ value;
}
```

## Slot  (token 0x020000cc)

```csharp
class Slot
{
    /* field */ key;
    /* field */ value;
}
```

## SlowMo  (token 0x02000025)

```csharp
class SlowMo
{
    /* field */ targetSpeed;
    /* field */ slowingDown;
    /* field */ fixedDelta;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ SlowDown(p1, p2, p3);
    /* method */ speedUp();
    /* method */ reset();
}
```

## Sniper  (token 0x02000026)

```csharp
class Sniper
{
    /* field */ shotPower;
    /* field */ gunEffect;
    /* field */ hitParticles;
    /* field */ trailColor;
    /* field */ shootSpot;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Shoot();
}
```

## SpecialFolder  (token 0x02000311)

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

## SPKey  (token 0x02000028)

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

## StateChanged  (token 0x02000016)

```csharp
class StateChanged
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## StaticGetter`1  (token 0x02000165)

```csharp
class StaticGetter`1
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## SubmitEvent  (token 0x02000062)

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

## SyncHashtable  (token 0x020000c5)

```csharp
class SyncHashtable
{
    /* field */ host;
    /* method */ .ctor(p1);
    /* method */ .ctor(p1, p2);
    /* method */ System.Collections.IEnumerable.GetEnumerator();
    /* method */ GetObjectData(p1, p2);
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

## SynchronizedArrayListWrapper  (token 0x020000b3)

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

## TableRange  (token 0x0200005c)

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

## TeamColors  (token 0x02000027)

```csharp
class TeamColors
{
    /* field */ blueTeamColors;
    /* field */ redTeamColors;
    /* method */ .ctor();
    /* method */ getTeamColor(p1);
}
```

## TextAlpha  (token 0x02000028)

```csharp
class TextAlpha
{
    /* field */ a;
    /* field */ c;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## TimerComparer  (token 0x020002e6)

```csharp
class TimerComparer
{
    /* method */ .ctor();
    /* method */ Compare(p1, p2);
}
```

## ToggleEvent  (token 0x02000087)

```csharp
class ToggleEvent
{
    /* method */ .ctor();
}
```

## ToggleTransition  (token 0x02000086)

```csharp
class ToggleTransition
{
    /* field */ value__;
    /* field */ None;
    /* field */ Fade;
}
```

## Tomahawk  (token 0x02000029)

```csharp
class Tomahawk
{
    /* field */ tomahawk;
    /* field */ shotPower;
    /* field */ destroyTime;
    /* field */ sr;
    /* field */ scale;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Shoot();
    /* method */ EnableSprite();
}
```

## TomahawkObj  (token 0x0200002a)

```csharp
class TomahawkObj
{
    /* field */ changeTime;
    /* field */ collided;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ changeLayer();
    /* method */ OnCollisionEnter2D(p1);
}
```

## Transform`1  (token 0x020000a3)

```csharp
class Transform`1
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2);
    /* method */ BeginInvoke(p1, p2, p3, p4);
    /* method */ EndInvoke(p1);
}
```

## Transition  (token 0x0200007a)

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

## TriggerEvent  (token 0x02000017)

```csharp
class TriggerEvent
{
    /* method */ .ctor();
}
```

## Type  (token 0x020000aa)

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

## Type  (token 0x02000053)

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

## TypeInfo  (token 0x0200021c)

```csharp
class TypeInfo
{
    /* field */ Attributes;
    /* field */ Elements;
    /* method */ .ctor();
}
```

## TypeMetadata  (token 0x0200022a)

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

## UnicodeDecoder  (token 0x020002d4)

```csharp
class UnicodeDecoder
{
    /* field */ bigEndian;
    /* field */ leftOverByte;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## Unit  (token 0x02000093)

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

## UnityType  (token 0x0200034d)

```csharp
class UnityType
{
    /* field */ value__;
    /* field */ DBNull;
    /* field */ Type;
    /* field */ Module;
    /* field */ Assembly;
}
```

## UpdatedEventHandler  (token 0x020000c2)

```csharp
class UpdatedEventHandler
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## UriScheme  (token 0x0200008f)

```csharp
class UriScheme
{
    /* field */ scheme;
    /* field */ delimiter;
    /* field */ defaultPort;
    /* method */ .ctor(p1, p2, p3);
}
```

## URLManager  (token 0x0200002b)

```csharp
class URLManager
{
    /* method */ .ctor();
    /* method */ OpenLink(p1);
    /* method */ openWindow(p1);
}
```

## UTF32Decoder  (token 0x020002ce)

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

## UTF7Decoder  (token 0x020002d0)

```csharp
class UTF7Decoder
{
    /* field */ leftOver;
    /* method */ .ctor();
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## UTF8Decoder  (token 0x020002d2)

```csharp
class UTF8Decoder
{
    /* field */ leftOverBits;
    /* field */ leftOverCount;
    /* method */ .ctor(p1);
    /* method */ GetChars(p1, p2, p3, p4, p5);
}
```

## ValueCollection  (token 0x020000a1)

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

## Water  (token 0x0200002c)

```csharp
class Water
{
    /* field */ waterMat;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
}
```

## WaterObjects  (token 0x0200002d)

```csharp
class WaterObjects
{
    /* field */ objects;
    /* field */ preObj;
    /* field */ depthAmount;
    /* field */ timeAmount;
    /* field */ waitAmount;
    /* field */ holder;
    /* method */ .ctor();
    /* method */ Start();
    /* method */ Update();
    /* method */ createObj(p1);
    /* method */ generatedPos(p1);
}
```

## Which  (token 0x02000300)

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

## WillRenderCanvases  (token 0x0200009e)

```csharp
class WillRenderCanvases
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke();
    /* method */ BeginInvoke(p1, p2);
    /* method */ EndInvoke(p1);
}
```

## WindowFunction  (token 0x020000a6)

```csharp
class WindowFunction
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1);
    /* method */ BeginInvoke(p1, p2, p3);
    /* method */ EndInvoke(p1);
}
```

## WriteDelegate  (token 0x020000fe)

```csharp
class WriteDelegate
{
    /* method */ .ctor(p1, p2);
    /* method */ Invoke(p1, p2, p3);
    /* method */ BeginInvoke(p1, p2, p3, p4, p5);
    /* method */ EndInvoke(p1);
}
```

## X509CertificateEnumerator  (token 0x02000087)

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

## X509CertificateEnumerator  (token 0x02000037)

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
