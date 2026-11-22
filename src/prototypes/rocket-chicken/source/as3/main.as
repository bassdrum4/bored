package
{
   import com.newgrounds.components.APIConnector;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.display.StageScaleMode;
   import flash.events.ContextMenuEvent;
   import flash.events.Event;
   import flash.events.KeyboardEvent;
   import flash.events.MouseEvent;
   import flash.events.TimerEvent;
   import flash.filters.BlurFilter;
   import flash.geom.ColorTransform;
   import flash.geom.Point;
   import flash.geom.Rectangle;
   import flash.media.Sound;
   import flash.media.SoundChannel;
   import flash.media.SoundTransform;
   import flash.net.SharedObject;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   import flash.text.TextField;
   import flash.ui.ContextMenu;
   import flash.ui.ContextMenuItem;
   import flash.utils.Dictionary;
   import flash.utils.Timer;
   import flash.utils.getDefinitionByName;
   
   [SWF(width="800", height="480", backgroundColor="#ff0000", frameRate="30")]
   public class main extends MovieClip
   {
      
      public static const _HUD:HUD = new HUD();
      
      public static var mobile:Boolean = false;
      
      public var loader:MovieClip;
      
      public var ybird:Yourbird;
      
      public var eggdone:MovieClip;
      
      public var egg:MovieClip;
      
      public var store:Store;
      
      public var optionsmenu:MovieClip;
      
      public var __id1_:APIConnector;
      
      public var veryhighbtn:SimpleButton;
      
      public var changeac:SimpleButton;
      
      public var ver:TextField;
      
      public var playgame:SimpleButton;
      
      public var UI:GUI;
      
      public var medbtn:SimpleButton;
      
      public var highbtn:SimpleButton;
      
      public var instructions:MovieClip;
      
      public var UIload:GUI;
      
      public var indicator:MovieClip;
      
      public var UIa:GUI;
      
      public var __setPropDict:Dictionary = new Dictionary(true);
      
      public var tot:Number;
      
      public var current:Number;
      
      public var pct:Number;
      
      public var added:Boolean;
      
      private var cFrame:String;
      
      private var player:Bird;
      
      private var container:Sprite = new Sprite();
      
      private var gravity:Number = 0.45;
      
      private var clouds:Vector.<Cloud> = new Vector.<Cloud>();
      
      private var cLen:int = 15;
      
      private var cRan:int = 0;
      
      private var cPool:Vector.<Cloud> = new Vector.<Cloud>();
      
      private var obLen:int = 10;
      
      private var obPool:Vector.<Obstacle> = new Vector.<Obstacle>();
      
      private var pRan:int = 0;
      
      private var pPool:Vector.<Power> = new Vector.<Power>();
      
      private var pLen:int = 15;
      
      private var powers:Vector.<Power> = new Vector.<Power>();
      
      private var alti:Number;
      
      private var ground:Sprite;
      
      private var toDeg:Number = 57.29577951308232;
      
      private var toRad:Number = 0.017453292519943295;
      
      private var distance:Number = 0;
      
      private var heighestPoint:int;
      
      private var con:Sprite = new Sprite();
      
      private var winning:Boolean = false;
      
      private var ScoreB:Scoreboard;
      
      private var scoring:Boolean = false;
      
      private var stillTime:int = 0;
      
      private var transitioner:Transitioner;
      
      private var playTime:int = 0;
      
      private var sheets:Vector.<FXBMD> = new Vector.<FXBMD>();
      
      private const sheetList:Vector.<String> = Vector.<String>(["expsheet","groundexpsheet","fjersheet","rocketsheet","firesheet"]);
      
      private var fxbmd:BitmapData;
      
      private var fxbmd2:BitmapData;
      
      private var fxbmd3:BitmapData;
      
      private var fxbm:Bitmap;
      
      private var fxbm2:Bitmap;
      
      private var fxbm3:Bitmap;
      
      private var pt:Point = new Point();
      
      private var pt2:Point = new Point();
      
      private const sw:int;
      
      private const sh:int;
      
      private var blur:BlurFilter = new BlurFilter(15,15);
      
      private var rect:Rectangle;
      
      private var rect2:Rectangle;
      
      private var rect3:Rectangle;
      
      private var pts:Vector.<Number> = new Vector.<Number>();
      
      private var fxcount:int = 0;
      
      private var rect4:Rectangle;
      
      private var cTransform:ColorTransform = new ColorTransform(1,1,1,0.9);
      
      private var cTransform2:ColorTransform = new ColorTransform(1,1,1,0.7);
      
      private var FXarr:Vector.<FX> = new Vector.<FX>();
      
      private var booster:FX = null;
      
      public var interval:int = 5;
      
      private var fxsprite1:Sprite = new Sprite();
      
      private var fxsprite2:Sprite = new Sprite();
      
      private var fxsprite3:Sprite = new Sprite();
      
      private var fx:MovieClip;
      
      private var atan:Number = 0;
      
      private var goPlayer:Boolean = false;
      
      private var feathers:FX = null;
      
      private var scroller:ScrollEngine = new ScrollEngine(stage);
      
      private var pPlace:int = 0;
      
      private var cPlace:int = 0;
      
      private var fxPlace:int = 0;
      
      private var fxPool:Vector.<FX> = new Vector.<FX>();
      
      private var leg:Sprite;
      
      private var arm:Sprite;
      
      private var head:MovieClip;
      
      private var pRot:Number;
      
      private var rot:Number;
      
      private var powern:Number;
      
      private var abs:Number;
      
      private var sceneInterval:int = 1;
      
      private var playerInterval:int = 2;
      
      private var gameScale:Number = 0.75;
      
      private var heighta:Number;
      
      private var tester:Tester = new Tester();
      
      private var top:Number;
      
      private var ar1:Number = 0;
      
      private var fuel:Number = 40;
      
      private var rocket:Boolean = false;
      
      private var bg:MovieClip;
      
      private var backadded:Boolean = false;
      
      private var back:int = 0;
      
      private var energy:int = 200;
      
      private var maxEnergy:int = 50;
      
      private var maxFuel:int = 130;
      
      private var obPlace:int = 0;
      
      private var obRan:int = 3;
      
      private var cloudc:Sprite = new Sprite();
      
      private var impact:Boolean = true;
      
      private var foradded:Boolean = false;
      
      private var forb:int = 0;
      
      private var tran:MovieClip;
      
      private var cashsound1:Sound = new catching();
      
      private var equipsound1:Sound = new equip();
      
      private var chicksound1:Sound = new chick1();
      
      private var chicksound2:Sound = new chick2();
      
      private var chicksound3:Sound = new chick3();
      
      private var rocketsound1:Sound = new rocketsound();
      
      private var rocketCounter:int = 0;
      
      private var punchsound1:Sound = new slama();
      
      private var punchsound2:Sound = new slamb();
      
      private var punchsound3:Sound = new slamc();
      
      private var punchsound4:Sound = new slamd();
      
      private var ding1:Sound = new ding();
      
      private var fxchannel:SoundChannel = new SoundChannel();
      
      private var musicchannel:SoundChannel = new SoundChannel();
      
      private var Theme:Sound = new theme();
      
      private var musicTransform:SoundTransform = new SoundTransform();
      
      private var fxTransform:SoundTransform = new SoundTransform();
      
      private var speedFire:FX = null;
      
      private var achs:Vector.<String> = new Vector.<String>();
      
      private var paralyzed:int = 0;
      
      private var headLocked:Boolean = false;
      
      private var frameRate:int = 25;
      
      private var efxpool:Vector.<eFX> = new Vector.<eFX>();
      
      private var efxcurrent:int = 0;
      
      private var sTree:MovieClip;
      
      private var starting:Boolean = true;
      
      private var xtra:Number;
      
      private var rsh:Number = stage.stageHeight * 1 / this.gameScale;
      
      private var rsw:Number = stage.stageWidth * 1 / this.gameScale;
      
      private var colScaleX:Number;
      
      private var colScaleY:Number;
      
      private var bgupdate:int = 0;
      
      private var weight:Number = 0;
      
      private var protect:Number = 1;
      
      private var fuelN:Number = 0;
      
      private var protN:Number = 0;
      
      private var weiN:Number = 0;
      
      private var moodN:Number = 0;
      
      private var birdName:String;
      
      private var Slot:SharedObject;
      
      private var startCash:int = 0;
      
      private var minirakketTimes:int = 0;
      
      private var gameTimes:int = 0;
      
      private var obsCount:int = 0;
      
      private var newItems:Vector.<bItem> = new Vector.<bItem>();
      
      private var bgparts1:Array = [];
      
      private var bgparts2:Array = [];
      
      private var hurt:int = 0;
      
      private var pause:Boolean = false;
      
      private var pauseS:MovieClip;
      
      private var pttkicker:Point = new Point();
      
      private var anglekicker:Number;
      
      private var waiting:int = 0;
      
      private var bootPower:Number;
      
      private var skrupURL:URLRequest = new URLRequest("http://skrupsakken.newgrounds.com/");
      
      private var dughURL:URLRequest = new URLRequest("http://dugh.newgrounds.com/");
      
      private var sponsorURL:URLRequest = new URLRequest("http://sponsor.com/");
      
      private var nQuality:String = "low";
      
      private var dir:Number;
      
      private var testing:Boolean = false;
      
      private var version:String = "1.0";
      
      private var verType:String = "release";
      
      private var downing:String = "";
      
      private var screaming:int = 0;
      
      private var grounding:int = 0;
      
      private var cashier:MovieClip = new cashies();
      
      private var hitCounter:int = 0;
      
      private var oldHit:int = 0;
      
      private var slotnum:int;
      
      private var musicPlay:Boolean = false;
      
      private var saveTimer:Timer = new Timer(12000);
      
      private var unlockCount:int = 1;
      
      private var pausebmd:BitmapData;
      
      private var pausebm:Bitmap;
      
      private var bonus:int;
      
      private var nnQuality:String = "low";
      
      private var cashieri:int = 80;
      
      public function main()
      {
         this.sw = stage.stageWidth * this.gameScale;
         this.sh = stage.stageHeight * this.gameScale;
         this.rect = new Rectangle(0,0,this.sw,this.sh);
         this.rect2 = new Rectangle(0,0,this.sw,this.sh);
         this.rect4 = new Rectangle(0,0,this.sw + 10,this.sh + 50);
         super();
         addFrameScript(0,this.frame1,1,this.frame2,2,this.frame3,4,this.frame5,5,this.frame6,6,this.frame7);
         globalVars.mobile = mobile;
         MochiBot.track(this,"d94d5b2a");
         globalVars.home = this;
         if(mobile)
         {
            stage.scaleMode = StageScaleMode.EXACT_FIT;
         }
         if(this.testing)
         {
            addChild(new ActiveGraph());
            addChild(new FPSCounter());
         }
         stage.quality = "high";
         var _loc1_:ContextMenu = new ContextMenu();
         _loc1_.hideBuiltInItems();
         var _loc2_:ContextMenuItem = new ContextMenuItem("Programming by Dugh");
         var _loc3_:ContextMenuItem = new ContextMenuItem("Art by Skrupsakken");
         var _loc4_:ContextMenuItem = new ContextMenuItem("-----------");
         var _loc5_:ContextMenuItem = new ContextMenuItem("OPTIONS");
         _loc1_.customItems.push(_loc2_);
         _loc1_.customItems.push(_loc3_);
         _loc1_.customItems.push(_loc4_);
         _loc1_.customItems.push(_loc5_);
         this.contextMenu = _loc1_;
         _loc2_.addEventListener(ContextMenuEvent.MENU_ITEM_SELECT,this.gotoDugh);
         _loc3_.addEventListener(ContextMenuEvent.MENU_ITEM_SELECT,this.gotoSkrup);
         _loc5_.addEventListener(ContextMenuEvent.MENU_ITEM_SELECT,this.openOptions);
         trace("CONNECTED");
         this.cFrame = "preload";
         stage.addEventListener(MouseEvent.CLICK,this.clicked);
         stage.addEventListener(KeyboardEvent.KEY_UP,this.upped);
         stage.addEventListener(MouseEvent.MOUSE_DOWN,this.downer);
         stage.addEventListener(MouseEvent.MOUSE_UP,this.upper);
         addEventListener(Event.ENTER_FRAME,this.updateI);
         stop();
         this.ver.text = "v." + this.version + " - " + this.verType;
         this.musicchannel.soundTransform = this.musicTransform;
         this.fxchannel.soundTransform = this.fxTransform;
         this.tran = new transit();
         addChild(this.tran);
         this.transitioner = new Transitioner(this.tran);
         addChild(this.transitioner);
      }
      
      public function showProgress(param1:Event) : void
      {
         this.tot = stage.loaderInfo.bytesTotal;
         this.current = stage.loaderInfo.bytesLoaded;
         if(this.tot > this.current)
         {
            this.pct = this.current / this.tot;
            this.loader.bar.width -= (this.loader.bar.width - this.loader.width * this.pct) * 0.2;
            this.egg.gotoAndStop(Math.ceil(100 * this.pct));
         }
         else if(!this.added)
         {
            this.loader.bar.width = this.loader.width;
            this.eggdone.x = this.egg.x;
            this.eggdone.y = this.egg.y;
            this.egg.visible = false;
            this.eggdone.scaleX = this.egg.scaleX;
            this.eggdone.scaleY = this.egg.scaleY;
            this.added = true;
            this.eggdone.gotoAndPlay(1);
            this.loader.alpha = 0.4;
            this.playgame.visible = true;
            removeEventListener(Event.ENTER_FRAME,this.showProgress);
         }
      }
      
      private function updateI(param1:Event) : void
      {
         if(this.optionsmenu != null)
         {
            if(this.optionsmenu.visible)
            {
               if(this.downing == "music")
               {
                  this.optionsmenu.musicslider.sliderbox.x -= (this.optionsmenu.musicslider.sliderbox.x - this.optionsmenu.musicslider.mouseX) * 0.3;
                  if(this.optionsmenu.musicslider.sliderbox.x < 0)
                  {
                     this.optionsmenu.musicslider.sliderbox.x = 0;
                  }
                  else if(this.optionsmenu.musicslider.sliderbox.x > 241)
                  {
                     this.optionsmenu.musicslider.sliderbox.x = 241;
                  }
                  this.musicTransform.volume = Math.round(this.optionsmenu.musicslider.sliderbox.x) / 241;
                  this.musicchannel.soundTransform = this.musicTransform;
                  trace(Math.round(this.optionsmenu.musicslider.sliderbox.x) / 241);
               }
               else if(this.downing == "sound")
               {
                  this.optionsmenu.soundslider.sliderbox.x -= (this.optionsmenu.soundslider.sliderbox.x - this.optionsmenu.soundslider.mouseX) * 0.3;
                  if(this.optionsmenu.soundslider.sliderbox.x < 0)
                  {
                     this.optionsmenu.soundslider.sliderbox.x = 0;
                  }
                  else if(this.optionsmenu.soundslider.sliderbox.x > 241)
                  {
                     this.optionsmenu.soundslider.sliderbox.x = 241;
                  }
                  this.fxTransform.volume = Math.round(this.optionsmenu.soundslider.sliderbox.x) / 241;
                  this.fxchannel.soundTransform = this.fxTransform;
               }
            }
         }
      }
      
      private function gotoSkrup(param1:ContextMenuEvent) : void
      {
         navigateToURL(this.skrupURL,"blank");
      }
      
      private function gotoDugh(param1:ContextMenuEvent) : void
      {
         navigateToURL(this.dughURL,"blank");
      }
      
      private function gotoSponsor(param1:ContextMenuEvent) : void
      {
         navigateToURL(this.sponsorURL,"blank");
      }
      
      private function openOptions(param1:ContextMenuEvent) : void
      {
         if(currentFrame > 2)
         {
            this.openOptionsMenu();
         }
      }
      
      private function openOptionsMenu() : void
      {
         if(this.pausebmd)
         {
            this.pausebmd.dispose();
         }
         if(this.pausebm)
         {
            if(this.optionsmenu.bg.contains(this.pausebm))
            {
               this.optionsmenu.bg.removeChild(this.pausebm);
            }
         }
         this.pausebmd = new BitmapData(this.rsw,this.rsh);
         this.pausebmd.draw(stage);
         this.pausebm = new Bitmap(this.pausebmd);
         this.optionsmenu.bg.addChild(this.pausebm);
         this.optionsmenu.visible = true;
         this.optionsmenu.clearData.info.text = "Slot " + this.slotnum + "\n" + this.birdName + "\n$" + globalVars.cash;
         this.optionsmenu.musicslider.sliderbox.x = this.musicTransform.volume * 241;
         this.optionsmenu.soundslider.sliderbox.x = this.fxTransform.volume * 241;
         switch(this.nQuality)
         {
            case "low":
               this.optionsmenu.indicator.x = this.optionsmenu.medbtn.x;
               break;
            case "medium":
               this.optionsmenu.indicator.x = this.optionsmenu.highbtn.x;
               break;
            case "high":
               this.optionsmenu.indicator.x = this.optionsmenu.veryhighbtn.x;
         }
         switch(this.cFrame)
         {
            case "menu":
               this.UI.able = 0;
               break;
            case "load":
               this.UIload.able = 0;
               break;
            case "store":
               this.UIa.able = 0;
               break;
            case "yourbird":
               this.UI.able = 0;
               break;
            case "game":
               if(!this.pauseS.visible)
               {
                  this.pause = true;
               }
         }
      }
      
      private function setupStuff() : void
      {
         var _loc2_:Cloud = null;
         var _loc3_:Power = null;
         var _loc4_:Obstacle = null;
         this.saveTimer.addEventListener(TimerEvent.TIMER,this.autoSave);
         this.ScoreB = new Scoreboard();
         this.fxbmd = new BitmapData(2048,2048,true,16777215);
         this.fxbmd2 = new BitmapData(2048,2048,true,16777215);
         this.fxbmd3 = new BitmapData(2048,2048,true,16777215);
         this.fxbm = new Bitmap(this.fxbmd);
         this.fxbm2 = new Bitmap(this.fxbmd2);
         this.fxbm3 = new Bitmap(this.fxbmd3);
         this.bg = new bgs();
         this.sTree = new StartTree();
         this.pauseS = new pauseScreen();
         this.pPool.length = 15;
         this.pPool.fixed = true;
         this.powers.length = 15;
         this.powers.fixed = true;
         this.cPool.length = 15;
         this.cPool.fixed = true;
         this.ground = new groundtile1();
         this.clouds.length = 15;
         this.clouds.fixed = true;
         this.fx = new speed();
         this.rect3 = new Rectangle(0,0,this.fxbmd.width,this.fxbmd.height);
         this.obPool.length = 10;
         this.obPool.fixed = true;
         this.fxPool.length = 30;
         this.fxPool.fixed = true;
         this.sheetList.fixed = true;
         addChild(this.pauseS);
         this.pauseS.visible = false;
         var _loc1_:int = 0;
         this.efxpool.length = 10;
         this.efxpool.fixed = true;
         while(_loc1_ < 10)
         {
            this.efxpool[_loc1_] = new eFX();
            _loc1_++;
         }
         _loc1_ = 0;
         while(_loc1_ < 30)
         {
            this.fxPool[_loc1_] = new FX(null,0,0);
            _loc1_++;
         }
         _loc1_ = 0;
         while(_loc1_ < 15)
         {
            _loc2_ = new Cloud();
            this.cPool[_loc1_] = _loc2_;
            _loc2_.visible = false;
            _loc1_++;
         }
         _loc1_ = 0;
         while(_loc1_ < 15)
         {
            _loc3_ = new Power();
            this.pPool[_loc1_] = _loc3_;
            _loc3_.visible = false;
            _loc1_++;
         }
         _loc1_ = 0;
         while(_loc1_ < 10)
         {
            _loc4_ = new Obstacle();
            this.obPool[_loc1_] = _loc4_;
            _loc4_.visible = false;
            this.container.addChild(this.obPool[_loc1_]);
            _loc1_++;
         }
         this.con.addChild(this.cloudc);
         this.setupFX();
         _loc1_ = 0;
         while(_loc1_ < 13)
         {
            this.bgparts1.push(this.bg.a.getChildAt(_loc1_));
            this.bgparts2.push(this.bg.b.getChildAt(_loc1_));
            _loc1_++;
         }
         _loc1_ = 0;
         this.con.addChild(this.cashier);
      }
      
      private function autoSave(param1:TimerEvent) : void
      {
         this.saveSlot();
         trace("SAVED");
      }
      
      private function checkSlots() : void
      {
         var _loc1_:SharedObject = null;
         var _loc2_:MovieClip = null;
         var _loc3_:int = 0;
         while(_loc3_ < 3)
         {
            _loc3_++;
            _loc1_ = SharedObject.getLocal(String("FC_Slot" + _loc3_));
            if(_loc1_ != null)
            {
               if(_loc1_.data.nam != undefined)
               {
                  _loc2_ = this.UIload[String("sa" + _loc3_)];
                  _loc2_.gotoAndStop(3);
                  _loc2_.nam.text = _loc1_.data.nam;
                  _loc2_.prog.text = "Progress: " + Math.round(_loc1_.data.unlocked / globalVars.totalItems * 100) + "%";
                  _loc2_.cash.text = "$" + _loc1_.data.cash;
                  _loc2_.unlocked.text = "Unlocked items:\n" + _loc1_.data.unlocked + "/" + globalVars.totalItems;
               }
            }
         }
      }
      
      private function setupFX() : void
      {
         var _loc1_:BitmapData = null;
         var _loc2_:FXBMD = null;
         var _loc3_:Sprite = null;
         var _loc4_:String = null;
         var _loc5_:int = 0;
         while(_loc5_ < this.sheetList.length)
         {
            _loc4_ = this.sheetList[_loc5_];
            _loc3_ = new (Class(getDefinitionByName(String(_loc4_))))();
            _loc1_ = new BitmapData(_loc3_.width,_loc3_.height,true,16777215);
            _loc1_.draw(_loc3_);
            _loc2_ = new FXBMD();
            _loc2_.bmd = _loc1_;
            switch(_loc4_)
            {
               case "fjersheet":
                  _loc2_.wid = 180;
                  _loc2_.hei = 180;
                  _loc2_.time = 2;
                  _loc2_.blur = false;
                  break;
               case "rocketsheet":
                  _loc2_.blur = true;
                  _loc2_.wid = 180;
                  _loc2_.hei = 180;
                  _loc2_.time = 2;
                  break;
               case "firesheet":
                  _loc2_.blur = true;
                  _loc2_.wid = 120;
                  _loc2_.hei = 120;
                  _loc2_.time = 2;
                  break;
               default:
                  _loc2_.blur = true;
                  _loc2_.wid = 180;
                  _loc2_.hei = 180;
                  _loc2_.time = 1;
            }
            _loc2_.rad = _loc2_.wid / 2;
            _loc2_.rect.width = _loc2_.wid;
            _loc2_.rect.height = _loc2_.hei;
            _loc2_.tiles = Math.round(_loc3_.width / _loc2_.wid);
            this.sheets[this.sheets.length] = _loc2_;
            _loc5_++;
         }
      }
      
      private function upper(param1:MouseEvent) : void
      {
         if(!globalVars.mobile)
         {
            this.downing = "";
         }
      }
      
      private function downer(param1:MouseEvent) : void
      {
         if(!globalVars.mobile)
         {
            if(this.optionsmenu != null)
            {
               if(this.optionsmenu.visible)
               {
                  if(param1.target.name == "slider" || param1.target.name == "sliderbox")
                  {
                     if(param1.target.parent.name == "musicslider")
                     {
                        this.downing = "music";
                     }
                     else
                     {
                        this.downing = "sound";
                     }
                  }
               }
            }
         }
      }
      
      private function clicked(param1:MouseEvent) : void
      {
         var _loc2_:MovieClip = null;
         var _loc3_:int = 0;
         var _loc4_:Store = null;
         var _loc5_:Array = null;
         var _loc6_:MovieClip = null;
         var _loc7_:int = 0;
         var _loc8_:int = 0;
         if(this.waiting != 0)
         {
            return;
         }
         if(this.optionsmenu != null)
         {
            if(this.optionsmenu.visible)
            {
               if(param1.target == this.optionsmenu.medbtn)
               {
                  this.nQuality = "low";
                  this.optionsmenu.indicator.x = this.optionsmenu.medbtn.x;
                  return;
               }
               if(param1.target == this.optionsmenu.highbtn)
               {
                  this.nQuality = "medium";
                  this.optionsmenu.indicator.x = this.optionsmenu.highbtn.x;
                  return;
               }
               if(param1.target == this.optionsmenu.veryhighbtn)
               {
                  this.nQuality = "high";
                  this.optionsmenu.indicator.x = this.optionsmenu.veryhighbtn.x;
                  return;
               }
               if(param1.target == this.optionsmenu.cross)
               {
                  this.closeOptionsMenu();
                  return;
               }
               if(this.optionsmenu.clearData.currentFrame == 1)
               {
                  if(param1.target == this.optionsmenu.clearData.clearbtn)
                  {
                     this.optionsmenu.clearData.nextFrame();
                  }
               }
               else if(param1.target == this.optionsmenu.clearData.okbtn)
               {
                  this.clearSlot(this.slotnum);
                  this.transitioner.transite();
                  gotoAndStop("load");
                  setChildIndex(this.tran,numChildren - 1);
                  this.checkSlots();
                  this.cFrame = "load";
                  this.closeOptionsMenu();
                  this.musicchannel.stop();
                  this.musicPlay = false;
               }
               if(this.cFrame == "game")
               {
                  stage.quality = this.nQuality;
               }
               return;
            }
         }
         if(this.pause)
         {
            if(param1.target == this.pauseS.resbtn)
            {
               this.Pause();
            }
            else if(param1.target == this.pauseS.restbtn)
            {
               this.restart();
            }
            else if(param1.target != this.pauseS.optbtn)
            {
               if(param1.target == this.pauseS.mainbtn)
               {
                  this.transitioner.transite();
                  this.cFrame = "menu";
                  this.Clear();
                  gotoAndStop("menu");
                  setChildIndex(this.tran,numChildren - 1);
               }
               else if(param1.target == this.pauseS.ops)
               {
                  this.openOptionsMenu();
               }
            }
            return;
         }
         if(this.cFrame == "preload")
         {
            if(param1.target == this.playgame)
            {
               nextFrame();
               this.setupStuff();
               this.checkSlots();
               this.cFrame = "load";
            }
            else
            {
               if(param1.target == this.medbtn)
               {
                  this.nnQuality = "low";
                  this.indicator.x = this.medbtn.x;
                  return;
               }
               if(param1.target == this.highbtn)
               {
                  this.nnQuality = "medium";
                  this.indicator.x = this.highbtn.x;
                  return;
               }
               if(param1.target == this.veryhighbtn)
               {
                  this.nnQuality = "high";
                  this.indicator.x = this.veryhighbtn.x;
                  return;
               }
            }
            return;
         }
         if(this.cFrame == "load")
         {
            if(param1.target == null)
            {
               return;
            }
            if(param1.target.name == "ov")
            {
               _loc2_ = param1.target.parent;
               if(_loc2_.currentFrame == 1)
               {
                  _loc2_.nextFrame();
                  _loc2_.scaleX = 1.3;
                  _loc2_.scaleY = 1.3;
               }
            }
            else if(param1.target.name == "con")
            {
               _loc2_ = param1.target.parent;
               this.birdName = _loc2_.nam.text;
               _loc2_.nextFrame();
               _loc2_.nam.text = this.birdName;
               _loc2_.prog.text = "Progress: 0%";
               _loc2_.cash.text = "$0";
               _loc2_.unlocked.text = "Unlocked items:\n" + 6 + "/" + globalVars.totalItems;
               this.newSlot(int(_loc2_.name.toString().charAt(2)),this.birdName);
            }
            else if(param1.target.name == "nam")
            {
               if(param1.target.text == "Name")
               {
                  param1.target.text = "";
               }
            }
            else if(param1.target.name == "clear")
            {
               _loc2_ = param1.target.parent;
               _loc2_.gotoAndStop(1);
               this.clearSlot(int(_loc2_.name.toString().charAt(2)));
               _loc2_.scaleX = 1;
               _loc2_.scaleY = 1;
            }
            else if(param1.target.name == "ova")
            {
               _loc2_ = param1.target.parent;
               this.loadSlot(int(_loc2_.name.toString().charAt(2)));
               this.transitioner.transite();
               nextFrame();
               setChildIndex(this.tran,numChildren - 1);
               this.playSound("ding",1);
               this.cFrame = "menu";
               if(!this.musicPlay)
               {
                  this.musicchannel = this.Theme.play(0,int.MAX_VALUE);
                  this.musicPlay = true;
                  this.musicchannel.soundTransform = this.musicTransform;
               }
            }
            return;
         }
         if(this.cFrame == "menu")
         {
            if(param1.target == this.UI.playbtn)
            {
               this.transitioner.transite();
               this.launchGame();
               setChildIndex(this.tran,numChildren - 1);
               return;
            }
            if(param1.target == this.UI.instructionsbtn)
            {
               this.instructions.visible = true;
               this.UI.able = 0;
               return;
            }
            if(param1.target == this.UI.birdbtn)
            {
               this.transitioner.transite();
               gotoAndStop("yourbird");
               this.cFrame = "yourbird";
               setChildIndex(this.tran,numChildren - 1);
               this.ybird.bird.rak.gotoAndStop(globalVars.rocket);
               this.ybird.bird.head.head.helm.gotoAndStop(globalVars.helmet);
               this.ybird.bird.belt.gotoAndStop(globalVars.belt);
               if(globalVars.notes.indexOf("yourbird") == -1)
               {
                  stage.focus = this;
                  globalVars.notes.push("yourbird");
                  this.ybird.note.visible = true;
               }
               if(globalVars.rocket != "none")
               {
                  this.fuelN += this.ybird.bird.rak.fuel;
                  this.weiN += this.ybird.bird.rak.weight;
               }
               if(globalVars.helmet != "none")
               {
                  this.protN += this.ybird.bird.head.head.helm.prot;
                  this.moodN += this.ybird.bird.head.head.helm.mood;
               }
               if(globalVars.belt != "none")
               {
                  this.weiN += this.ybird.bird.belt.weight;
                  this.protN += this.ybird.bird.belt.prot;
               }
               this.ybird.wei.text = "" + this.weiN;
               this.ybird.prot.text = "" + this.protN;
               this.ybird.con.text = "" + this.moodN;
               this.ybird.fuel.text = "" + this.fuelN;
               return;
            }
            if(param1.target == this.UI.ops)
            {
               this.openOptionsMenu();
            }
            else if(param1.target == this.changeac)
            {
               this.transitioner.transite();
               gotoAndStop("load");
               this.cFrame = "load";
               this.checkSlots();
               setChildIndex(this.tran,numChildren - 1);
               this.musicchannel.stop();
               this.musicPlay = false;
            }
            if(this.instructions.visible)
            {
               if(param1.target == this.instructions.cross)
               {
                  this.instructions.visible = false;
                  this.UI.able = 1;
                  return;
               }
            }
         }
         else if(this.cFrame == "game")
         {
            if(this.starting)
            {
               this.paralyzed = 20;
               this.sTree.kicker.leg.lega.gotoAndStop(2);
               this.sTree.kicker.leg.stop();
               _loc3_ = (this.sTree.kicker.leg.bar.blip.height + 100) * 0.07 * this.bootPower;
               this.player.vx = -Math.cos(this.anglekicker) * _loc3_;
               this.player.vy = -Math.sin(this.anglekicker) * _loc3_;
               this.createFX(this.player,15);
               this.createEFX(1.5);
               this.playSound("punchsound",4);
               this.playSound("chicksound",3);
               this.starting = false;
               this.player.visible = true;
               this.sTree.birda.visible = false;
            }
            else if(this.winning)
            {
               if(this.ScoreB.birdbtn.hitTestPoint(mouseX,mouseY))
               {
                  this.transitioner.transite();
                  this.Clear();
                  gotoAndStop("store");
                  this.cFrame = "store";
                  if(globalVars.newHelmet)
                  {
                     this.UIa.helmbtn.newy.visible = true;
                     this.UIa.helmbtn.newy.play();
                  }
                  if(globalVars.newBelt)
                  {
                     this.UIa.beltbtn.newy.visible = true;
                     this.UIa.beltbtn.newy.play();
                  }
                  setChildIndex(this.tran,numChildren - 1);
                  return;
               }
               if(this.ScoreB.backto.hitTestPoint(mouseX,mouseY))
               {
                  this.transitioner.transite();
                  this.Clear();
                  this.launchGame();
                  setChildIndex(this.tran,numChildren - 1);
                  return;
               }
            }
         }
         else if(this.cFrame == "store")
         {
            _loc4_ = this.store;
            if(param1.target == this.UIa.backtoa)
            {
               this.transitioner.transite();
               this.launchGame();
               setChildIndex(this.tran,numChildren - 1);
               return;
            }
            if(param1.target == this.UIa.birdbtn)
            {
               this.transitioner.transite();
               this.cFrame = "yourbird";
               gotoAndStop("yourbird");
               setChildIndex(this.tran,numChildren - 1);
               this.ybird.bird.rak.gotoAndStop(globalVars.rocket);
               this.ybird.bird.head.head.helm.gotoAndStop(globalVars.helmet);
               this.ybird.bird.belt.gotoAndStop(globalVars.belt);
               this.protN = 0;
               this.weiN = 0;
               this.moodN = 0;
               this.fuelN = 0;
               if(globalVars.rocket != "none")
               {
                  this.fuelN += this.ybird.bird.rak.fuel;
                  this.weiN += this.ybird.bird.rak.weight;
               }
               if(globalVars.helmet != "none")
               {
                  this.protN += this.ybird.bird.head.head.helm.prot;
                  this.moodN += this.ybird.bird.head.head.helm.mood;
               }
               if(globalVars.belt != "none")
               {
                  this.weiN += this.ybird.bird.belt.weight;
                  this.protN += this.ybird.bird.belt.prot;
               }
               this.ybird.wei.text = "" + this.weiN;
               this.ybird.prot.text = "" + this.protN;
               this.ybird.con.text = "" + this.moodN;
               this.ybird.fuel.text = "" + this.fuelN;
               if(globalVars.notes.indexOf("yourbird") == -1)
               {
                  globalVars.notes.push("yourbird");
                  this.ybird.note.visible = true;
               }
               return;
            }
            if(param1.target == this.UIa.udsbtn)
            {
               _loc4_.cat = "rocket";
               _loc4_.Update();
               return;
            }
            if(param1.target == this.UIa.helmbtn.ov)
            {
               _loc4_.cat = "helmet";
               _loc4_.Update();
               if(globalVars.newHelmet)
               {
                  this.UIa.helmbtn.newy.visible = false;
                  this.UIa.helmbtn.newy.gotoAndStop(1);
                  globalVars.newHelmet = false;
               }
               return;
            }
            if(param1.target == this.UIa.beltbtn.ov)
            {
               _loc4_.cat = "belt";
               _loc4_.Update();
               if(globalVars.newBelt)
               {
                  this.UIa.beltbtn.newy.visible = false;
                  this.UIa.beltbtn.newy.gotoAndStop(1);
                  globalVars.newBelt = false;
               }
               return;
            }
            if(param1.target == this.UIa.menubtn)
            {
               this.transitioner.transite();
               this.cFrame = "menu";
               gotoAndStop("menu");
               setChildIndex(this.tran,numChildren - 1);
               return;
            }
            if(_loc4_.nex.visible)
            {
               if(param1.target == _loc4_.nex)
               {
                  _loc4_.container.circles[_loc4_.container.currenta].prevFrame();
                  ++_loc4_.container.currenta;
                  _loc4_.container.circles[_loc4_.container.currenta].nextFrame();
                  _loc4_.container.position = -_loc4_.container.Pars[_loc4_.container.currenta * 2].x + 40;
                  return;
               }
            }
            if(_loc4_.prev.visible)
            {
               if(param1.target == _loc4_.prev)
               {
                  _loc4_.container.circles[_loc4_.container.currenta].prevFrame();
                  --_loc4_.container.currenta;
                  _loc4_.container.circles[_loc4_.container.currenta].nextFrame();
                  _loc4_.container.position = -_loc4_.container.Pars[_loc4_.container.currenta * 2].x + 40;
                  return;
               }
            }
            _loc5_ = _loc4_.container.Pars;
            _loc7_ = 0;
            while(_loc7_ < _loc5_.length)
            {
               if(_loc4_.container.disabled != 0)
               {
                  break;
               }
               _loc6_ = _loc5_[_loc7_];
               if(_loc6_ != null)
               {
                  if(_loc6_.hitTestPoint(mouseX,mouseY))
                  {
                     _loc8_ = globalVars.cash;
                     switch(_loc6_.currentLabel)
                     {
                        case "rockets":
                           if(_loc8_ >= _loc6_.rak.num)
                           {
                              globalVars.cash -= _loc6_.rak.num;
                              globalVars.rockets.push(_loc6_.rak.currentLabel);
                              globalVars.rocket = _loc6_.rak.currentLabel;
                              this.playSound("cashsound",1);
                              _loc4_.Update();
                              _loc4_.ca.text = "$" + globalVars.cash;
                           }
                           break;
                        case "helmets":
                           if(_loc8_ >= _loc6_.helm.num)
                           {
                              globalVars.cash -= _loc6_.helm.num;
                              globalVars.helmets.push(_loc6_.helm.currentLabel);
                              globalVars.helmet = _loc6_.helm.currentLabel;
                              this.playSound("cashsound",1);
                              _loc4_.Update();
                              _loc4_.ca.text = "$" + globalVars.cash;
                           }
                           break;
                        case "belts":
                           if(_loc8_ >= _loc6_.belt.num)
                           {
                              globalVars.cash -= _loc6_.belt.num;
                              globalVars.belts.push(_loc6_.belt.currentLabel);
                              globalVars.belt = _loc6_.belt.currentLabel;
                              this.playSound("cashsound",1);
                              _loc4_.Update();
                              _loc4_.ca.text = "$" + globalVars.cash;
                           }
                     }
                     this.saveSlot();
                     return;
                  }
               }
               _loc7_++;
            }
         }
         else if(this.cFrame == "yourbird")
         {
            if(param1.target == this.ybird.container1.nex)
            {
               this.ybird.container1.circles[this.ybird.container1.currenta].prevFrame();
               ++this.ybird.container1.currenta;
               this.ybird.container1.circles[this.ybird.container1.currenta].nextFrame();
               this.ybird.container1.position = -this.ybird.container1.Pars[this.ybird.container1.currenta * 2].y;
               return;
            }
            if(param1.target == this.ybird.container2.nex)
            {
               this.ybird.container2.circles[this.ybird.container2.currenta].prevFrame();
               ++this.ybird.container2.currenta;
               this.ybird.container2.circles[this.ybird.container2.currenta].nextFrame();
               this.ybird.container2.position = -this.ybird.container2.Pars[this.ybird.container2.currenta * 2].y;
               return;
            }
            if(param1.target == this.ybird.container3.nex)
            {
               this.ybird.container3.circles[this.ybird.container3.currenta].prevFrame();
               ++this.ybird.container3.currenta;
               this.ybird.container3.circles[this.ybird.container3.currenta].nextFrame();
               this.ybird.container3.position = -this.ybird.container3.Pars[this.ybird.container3.currenta * 2].y;
               return;
            }
            if(param1.target == this.ybird.container1.prev)
            {
               this.ybird.container1.circles[this.ybird.container1.currenta].prevFrame();
               --this.ybird.container1.currenta;
               this.ybird.container1.circles[this.ybird.container1.currenta].nextFrame();
               this.ybird.container1.position = -this.ybird.container1.Pars[this.ybird.container1.currenta * 2].y;
               return;
            }
            if(param1.target == this.ybird.container2.prev)
            {
               this.ybird.container2.circles[this.ybird.container2.currenta].prevFrame();
               --this.ybird.container2.currenta;
               this.ybird.container2.circles[this.ybird.container2.currenta].nextFrame();
               this.ybird.container2.position = -this.ybird.container2.Pars[this.ybird.container2.currenta * 2].y;
               return;
            }
            if(param1.target == this.ybird.container3.prev)
            {
               this.ybird.container3.circles[this.ybird.container3.currenta].prevFrame();
               --this.ybird.container3.currenta;
               this.ybird.container3.circles[this.ybird.container3.currenta].nextFrame();
               this.ybird.container3.position = -this.ybird.container3.Pars[this.ybird.container3.currenta * 2].y;
               return;
            }
            if(param1.target == this.UI.backto)
            {
               this.transitioner.transite();
               this.launchGame();
               setChildIndex(this.tran,numChildren - 1);
            }
            else if(param1.target == this.UI.storebtn)
            {
               this.transitioner.transite();
               gotoAndStop("store");
               this.cFrame = "store";
               if(globalVars.newHelmet)
               {
                  this.UIa.helmbtn.newy.visible = true;
                  this.UIa.helmbtn.newy.play();
               }
               if(globalVars.newBelt)
               {
                  this.UIa.beltbtn.newy.visible = true;
                  this.UIa.beltbtn.newy.play();
               }
               setChildIndex(this.tran,numChildren - 1);
            }
            else if(param1.target == this.UI.menubtn)
            {
               this.transitioner.transite();
               this.cFrame = "menu";
               gotoAndStop("menu");
               setChildIndex(this.tran,numChildren - 1);
            }
            else
            {
               _loc7_ = 0;
               _loc5_ = Yourbird(this.ybird).container2.Pars;
               while(_loc7_ < _loc5_.length)
               {
                  if(this.ybird.container2.disabled != 0)
                  {
                     break;
                  }
                  _loc6_ = _loc5_[_loc7_];
                  if(_loc6_.hitTestPoint(mouseX,mouseY))
                  {
                     if(globalVars.rocket != "none")
                     {
                        this.fuelN -= this.ybird.bird.rak.fuel;
                        this.weiN -= this.ybird.bird.rak.weight;
                     }
                     this.playSound("equipsound",1);
                     this.ybird.bird.rak.gotoAndStop(_loc6_.rak.currentLabel);
                     globalVars.rocket = _loc6_.rak.currentLabel;
                     this.fuelN += this.ybird.bird.rak.fuel;
                     this.weiN += this.ybird.bird.rak.weight;
                     this.ybird.wei.text = "" + this.weiN;
                     this.ybird.fuel.text = "" + this.fuelN;
                     this.saveSlot();
                     return;
                  }
                  _loc7_++;
               }
               _loc7_ = 0;
               _loc5_ = Yourbird(this.ybird).container1.Pars;
               while(_loc7_ < _loc5_.length)
               {
                  if(this.ybird.container1.disabled != 0)
                  {
                     break;
                  }
                  _loc6_ = _loc5_[_loc7_];
                  if(_loc6_.hitTestPoint(mouseX,mouseY))
                  {
                     if(globalVars.helmet != "none")
                     {
                        this.moodN -= this.ybird.bird.head.head.helm.mood;
                        this.protN -= this.ybird.bird.head.head.helm.prot;
                     }
                     this.ybird.bird.head.head.helm.gotoAndStop(_loc6_.helm.currentLabel);
                     globalVars.helmet = _loc6_.helm.currentLabel;
                     this.moodN += this.ybird.bird.head.head.helm.mood;
                     this.protN += this.ybird.bird.head.head.helm.prot;
                     this.playSound("equipsound",1);
                     this.ybird.prot.text = "" + this.protN;
                     this.ybird.con.text = "" + this.moodN;
                     this.saveSlot();
                     return;
                  }
                  _loc7_++;
               }
               _loc7_ = 0;
               _loc5_ = Yourbird(this.ybird).container3.Pars;
               while(_loc7_ < _loc5_.length)
               {
                  if(this.ybird.container3.disabled != 0)
                  {
                     break;
                  }
                  _loc6_ = _loc5_[_loc7_];
                  if(_loc6_.hitTestPoint(mouseX,mouseY))
                  {
                     if(globalVars.belt != "none")
                     {
                        this.ybird.bird.belt.gotoAndStop(globalVars.belt);
                        if(this.protN != 0)
                        {
                           this.protN -= this.ybird.bird.belt.prot;
                        }
                        if(this.weiN != 0)
                        {
                           this.weiN -= this.ybird.bird.belt.weight;
                        }
                     }
                     this.ybird.bird.belt.gotoAndStop(_loc6_.belt.currentLabel);
                     globalVars.belt = _loc6_.belt.currentLabel;
                     this.protN += this.ybird.bird.belt.prot;
                     this.weiN += this.ybird.bird.belt.weight;
                     this.playSound("equipsound",1);
                     this.ybird.wei.text = "" + this.weiN;
                     this.ybird.prot.text = "" + this.protN;
                     this.saveSlot();
                     return;
                  }
                  _loc7_++;
               }
            }
         }
      }
      
      private function closeOptionsMenu() : void
      {
         this.optionsmenu.visible = false;
         switch(this.cFrame)
         {
            case "menu":
               this.UI.able = 1;
               break;
            case "load":
               this.UIload.able = 1;
               break;
            case "store":
               this.UIa.able = 1;
               break;
            case "yourbird":
               this.UI.able = 1;
               break;
            case "game":
               if(!this.pauseS.visible)
               {
                  this.pause = false;
               }
         }
         this.optionsmenu.clearData.gotoAndStop(1);
         this.saveSlot();
      }
      
      private function saveSlot() : void
      {
         globalVars.unlocked = globalVars.ubelt.length + globalVars.uhelmet.length + globalVars.urocket.length;
         this.Slot.data.unlockCount = this.unlockCount;
         this.Slot.data.unlocked = globalVars.unlocked;
         this.Slot.data.belts = globalVars.ubelt;
         this.Slot.data.helmets = globalVars.uhelmet;
         this.Slot.data.rockets = globalVars.urocket;
         this.Slot.data.cash = globalVars.cash;
         this.Slot.data.notes = globalVars.notes;
         this.Slot.data.belt = globalVars.belt;
         this.Slot.data.helmet = globalVars.helmet;
         this.Slot.data.rocket = globalVars.rocket;
         this.Slot.data.bbelts = Vector.<String>(globalVars.belts);
         this.Slot.data.brockets = Vector.<String>(globalVars.rockets);
         this.Slot.data.bhelmets = Vector.<String>(globalVars.helmets);
         this.Slot.data.gameTimes = this.gameTimes;
         this.Slot.data.minirakketTimes = this.minirakketTimes;
         this.Slot.data.newHelmet = globalVars.newHelmet;
         this.Slot.data.newBelt = globalVars.newBelt;
         this.Slot.data.boot = globalVars.boot;
         this.Slot.data.boots = Vector.<String>(globalVars.boots);
         this.Slot.data.fxvolume = this.fxTransform.volume;
         this.Slot.data.musicvolume = this.musicTransform.volume;
         this.Slot.data.quality = this.nQuality;
         this.Slot.data.news = globalVars.news;
         this.Slot.data.alltime = globalVars.allTimeBest;
         this.Slot.data.ftR = globalVars.ftR;
         this.Slot.data.ftB = globalVars.ftB;
         this.Slot.data.ftH = globalVars.ftH;
      }
      
      private function loadSlot(param1:int) : void
      {
         var _loc2_:SharedObject = SharedObject.getLocal(String("FC_Slot" + param1));
         this.Slot = _loc2_;
         this.slotnum = param1;
         globalVars.ubelt = Vector.<String>(_loc2_.data.belts);
         globalVars.uhelmet = Vector.<String>(_loc2_.data.helmets);
         globalVars.urocket = Vector.<String>(_loc2_.data.rockets);
         globalVars.unlocked = globalVars.ubelt.length + globalVars.uhelmet.length + globalVars.urocket.length;
         globalVars.notes = Vector.<String>(_loc2_.data.notes);
         globalVars.belt = this.Slot.data.belt;
         globalVars.helmet = this.Slot.data.helmet;
         globalVars.rocket = this.Slot.data.rocket;
         globalVars.belts = Vector.<String>(this.Slot.data.bbelts);
         globalVars.rockets = Vector.<String>(this.Slot.data.brockets);
         globalVars.helmets = Vector.<String>(this.Slot.data.bhelmets);
         globalVars.newHelmet = this.Slot.data.newHelmet;
         globalVars.newBelt = this.Slot.data.newBelt;
         globalVars.boot = this.Slot.data.boot;
         globalVars.boots = Vector.<String>(this.Slot.data.boots);
         globalVars.ftR = this.Slot.data.ftR;
         globalVars.ftB = this.Slot.data.ftB;
         globalVars.ftH = this.Slot.data.ftH;
         this.unlockCount = this.Slot.data.unlockCount;
         globalVars.news = Vector.<String>(this.Slot.data.news);
         globalVars.allTimeBest = _loc2_.data.alltime;
         this.gameTimes = _loc2_.data.gameTimes;
         this.minirakketTimes = _loc2_.data.minirakketTimes;
         this.fxTransform.volume = _loc2_.data.fxvolume;
         this.musicTransform.volume = _loc2_.data.musicvolume;
         this.nQuality = _loc2_.data.quality;
         globalVars.cash = _loc2_.data.cash;
         this.birdName = _loc2_.data.nam;
         this.saveTimer.start();
      }
      
      private function clearSlot(param1:int) : void
      {
         var _loc2_:SharedObject = SharedObject.getLocal(String("FC_Slot" + param1));
         _loc2_.clear();
      }
      
      private function newSlot(param1:int, param2:String) : void
      {
         var _loc3_:SharedObject = SharedObject.getLocal(String("FC_Slot" + param1));
         _loc3_.data.nam = param2;
         _loc3_.data.cash = this.startCash;
         _loc3_.data.belts = Vector.<String>(["nbelt","furrybelt","paperbelt","smileybelt"]);
         _loc3_.data.helmets = Vector.<String>(["prophat","bheadband","blheadband","rheadband","gheadband","wheadband"]);
         _loc3_.data.rockets = Vector.<String>(["minirakket","crakket","minirakket2","crakket2"]);
         _loc3_.data.belt = "nbeltblack";
         _loc3_.data.helmet = "none";
         _loc3_.data.rocket = "none";
         _loc3_.data.bbelts = Vector.<String>(["nbeltblack"]);
         _loc3_.data.bhelmets = Vector.<String>(["none"]);
         _loc3_.data.brockets = Vector.<String>(["none"]);
         _loc3_.data.unlocked = 6;
         _loc3_.data.notes = Vector.<String>([]);
         _loc3_.data.minirakketTimes = 0;
         _loc3_.data.gameTimes = 0;
         _loc3_.data.newHelmet = true;
         _loc3_.data.newBelt = true;
         _loc3_.data.boot = "none";
         _loc3_.data.boots = Vector.<String>([]);
         _loc3_.data.fxvolume = 1;
         _loc3_.data.musicvolume = 1;
         _loc3_.data.quality = "low";
         _loc3_.data.unlockCount = 1;
         _loc3_.data.news = Vector.<String>([]);
         _loc3_.data.alltime = 0;
         _loc3_.data.ftR = Vector.<int>([0,0,0,0,350,400,650,1000,1300,1600,1800,2000,2200,2600,3000,3500,4500,7000]);
         _loc3_.data.ftH = Vector.<int>([0,0,0,0,0,0,250,370,370,620,620,620,620,620,900,900,900,900,900,1200,1200,1200,1200,1200,1550,1550,1850,1850,1950,1950,1950,1950,1950,2150,2150,2150,2150,2150,2500,2500,2500,2500,2500,2700,2800,2900,2900,2900,2900,2900,3250,3600,3600,3850,4000,4250,4250,4250,4500,4700,4700,4700,4800,5000,5400,5800,5800,5800,5800,6150,6300,6400]);
         _loc3_.data.ftB = Vector.<int>([0,0,0,0,0,250,500,500,850,850,1500,1750,1750,2050,2050,2400,2400,2750,2750,2800,3100,3400,3700,3700,4000,4000,4400,4600,4800,5200,5200,5600,6000]);
         if(this.nnQuality != "")
         {
            _loc3_.data.quality = this.nnQuality;
         }
         _loc3_.flush();
      }
      
      private function Clear() : void
      {
         var _loc3_:* = undefined;
         var _loc4_:* = undefined;
         stage.quality = "high";
         this.obsCount = 0;
         this.saveSlot();
         this.cashieri = 80;
         if(!mobile)
         {
            this.con.removeChild(this.fx);
            this.fx.alpha = 0;
         }
         this.bonus = 0;
         this.starting = true;
         this.playTime = 0;
         this.pause = false;
         this.pauseS.visible = false;
         this.ScoreB.visible = false;
         _HUD.fuel.visible = true;
         _HUD.bar.visible = true;
         _HUD.feet.visible = true;
         if(globalVars.mobile)
         {
            _HUD.con.visible = true;
         }
         this.fxbmd.fillRect(this.rect3,16777215);
         this.fxbmd2.fillRect(this.rect3,16777215);
         this.fxbmd3.fillRect(this.rect3,16777215);
         this.stillTime = 0;
         this.scoring = false;
         this.winning = false;
         this.fuel = this.maxFuel;
         this.energy = this.maxEnergy;
         this.weight = 0;
         this.protect = 0;
         this.container.x = 0;
         this.con.x = 0;
         this.hurt = 0;
         this.paralyzed = 0;
         this.container.y = 0;
         this.con.y = 0;
         this.bg.x = 0;
         this.bg.y = 0;
         this.goPlayer = false;
         this.player.vx = 0;
         this.player.vy = 0;
         this.player.down = false;
         this.player.up = false;
         this.player.inAir = true;
         this.pPlace = 0;
         this.ground.x = 0;
         this.ScoreB.Default();
         this.ground.y = 0;
         this.distance = 0;
         this.alti = 0;
         this.cPlace = 0;
         this.fxPlace = 0;
         removeChild(this.con);
         this.con.removeChild(this.container);
         this.con.removeChild(this.bg);
         this.ScoreB.visible = false;
         this.con.removeChild(this.fxsprite1);
         this.con.removeChild(this.fxsprite2);
         this.con.removeChild(this.fxsprite3);
         this.fxsprite1.removeChild(this.fxbm);
         this.fxsprite2.removeChild(this.fxbm2);
         this.fxsprite3.removeChild(this.fxbm3);
         this.container.removeChild(this.ground);
         var _loc1_:int = 0;
         _loc1_ = 0;
         var _loc2_:int = 0;
         while(_loc1_ < 15)
         {
            this.container.removeChild(this.pPool[_loc1_]);
            this.cloudc.removeChild(this.cPool[_loc1_]);
            _loc1_++;
         }
         removeChild(_HUD);
         removeChild(this.ScoreB);
         removeEventListener(Event.ENTER_FRAME,this.update);
         stage.removeEventListener(KeyboardEvent.KEY_DOWN,this.downed);
         if(mobile)
         {
         }
         _loc1_ = 0;
         while(_loc1_ < 13)
         {
            _loc4_ = this.bgparts1[_loc1_];
            _loc3_ = this.bgparts2[_loc1_];
            _loc4_.visible = true;
            _loc3_.visible = true;
            _loc1_++;
         }
      }
      
      private function launchGame() : void
      {
         stage.quality = this.nQuality;
         this.waiting = 10;
         stage.focus = stage;
         gotoAndStop("game");
         this.cFrame = "game";
         this.fx.scaleX = 1 / this.gameScale;
         this.fx.scaleY = this.fx.scaleX;
         addChild(this.con);
         this.xtra = -this.sh + stage.stageHeight + 50;
         this.con.scaleX = this.gameScale;
         this.con.scaleY = this.gameScale;
         this.con.addChild(this.container);
         this.con.addChild(this.bg);
         this.con.setChildIndex(this.bg,0);
         this.bg.y = 0;
         this.bg.x = 0;
         this.con.addChild(this.fxsprite1);
         this.con.addChild(this.fxsprite2);
         this.fxsprite1.addChild(this.fxbm);
         this.fxsprite2.addChild(this.fxbm2);
         this.fxbm.y = -600;
         this.fxbm2.y = -600;
         this.fxbm.x = -300;
         this.fxbm2.x = -300;
         this.fxbm3.y = -600;
         this.fxbm3.x = -300;
         this.createBird();
         if(globalVars.rocket != "none")
         {
            this.maxFuel = this.player.bird.rak.fuel * 1.3;
         }
         this.fuel = this.maxFuel;
         this.con.mouseChildren = false;
         this.con.mouseEnabled = false;
         this.container.mouseChildren = false;
         this.container.mouseEnabled = false;
         this.container.addChild(this.sTree);
         this.player.visible = false;
         this.container.addChild(this.ground);
         this.sTree.kicker.leg.lega.gotoAndStop(1);
         this.sTree.kicker.leg.lega.boot.gotoAndStop(globalVars.boot);
         this.sTree.kicker.leg.play();
         this.sTree.birda.visible = true;
         var _loc1_:int = 0;
         var _loc2_:int = 0;
         while(_loc1_ < 15)
         {
            this.container.addChild(this.pPool[_loc1_]);
            this.cloudc.addChild(this.cPool[_loc1_]);
            if(++_loc2_ == 2)
            {
               this.cPool[_loc1_].visible = true;
               this.cPool[_loc1_].x = -1000;
               this.cPool[_loc1_].y = -1000;
               this.pPool[_loc1_].visible = true;
               this.pPool[_loc1_].x = -1000;
               this.pPool[_loc1_].y = -1000;
               _loc2_ = 0;
            }
            _loc1_++;
         }
         addChild(_HUD);
         this.SetHUDHEIGHT(150);
         this.heighta = -_HUD.top * 10;
         this.top = _HUD.top * 10 + this.xtra;
         this.con.addChild(this.fxsprite3);
         this.fxsprite3.addChild(this.fxbm3);
         addChild(this.ScoreB);
         this.ScoreB.visible = false;
         this.ground.y = this.top;
         addEventListener(Event.ENTER_FRAME,this.update);
         stage.addEventListener(KeyboardEvent.KEY_DOWN,this.downed);
         if(mobile)
         {
         }
         this.con.setChildIndex(this.cloudc,2);
         if(!mobile)
         {
            this.con.addChild(this.fx);
            this.fx.x = this.player.x;
            this.fx.y = this.player.y;
            this.con.setChildIndex(this.fx,this.con.numChildren - 1);
            this.fx.alpha = 0;
            this.fx.visible = false;
         }
         this.sTree.birda.rak.gotoAndStop(globalVars.rocket);
         this.sTree.birda.head.head.helm.gotoAndStop(globalVars.helmet);
         this.sTree.birda.belt.gotoAndStop(globalVars.belt);
         if(globalVars.rocket == "none")
         {
            _HUD.fuel.visible = false;
         }
         else
         {
            _HUD.fuel.visible = true;
         }
         this.sTree.visible = true;
         this.energy = this.maxEnergy;
         if(globalVars.rocket != "none")
         {
            _HUD.fuel.bar.width = 334;
         }
         _HUD.bar.bar.width = 304;
         _HUD.feet.text = 0 + " FT";
         if(globalVars.notes.indexOf("startTree") == -1)
         {
            this.sTree.note.play();
            globalVars.notes.push("startTree");
         }
         else
         {
            this.sTree.note.visible = false;
         }
         setChildIndex(_HUD,numChildren - 1);
         switch(globalVars.boot)
         {
            case "none":
               this.bootPower = 3;
               break;
            case "boota":
               this.bootPower = 3.8;
               break;
            case "bootb":
               this.bootPower = 4.5;
               break;
            case "bootc":
               this.bootPower = 5.6;
         }
         this.con.setChildIndex(this.cashier,this.con.numChildren - 1);
      }
      
      private function SetHUDHEIGHT(param1:int) : void
      {
         _HUD.top = param1;
         this.alti = _HUD.top;
         this.heighestPoint = _HUD.top;
      }
      
      private function upped(param1:KeyboardEvent) : void
      {
         if(this.cFrame == "game")
         {
            if(param1.keyCode == 38)
            {
               this.player.up = false;
            }
            else if(param1.keyCode == 40)
            {
               this.player.down = false;
            }
            if(param1.keyCode == 82)
            {
               this.restart();
            }
            else if(param1.keyCode == 80)
            {
               this.Pause();
            }
         }
         if(param1.keyCode == 32)
         {
            if(this.cFrame == "yourbird")
            {
               if(this.ybird.note.visible)
               {
                  this.ybird.note.visible = false;
               }
            }
            this.rocket = false;
         }
      }
      
      private function Pause() : void
      {
         if(!this.optionsmenu.visible)
         {
            if(!this.pause)
            {
               if(this.pausebmd)
               {
                  this.pausebmd.dispose();
               }
               if(this.pausebm)
               {
                  if(this.pauseS.bg.contains(this.pausebm))
                  {
                     this.pauseS.bg.removeChild(this.pausebm);
                  }
               }
               this.pausebmd = new BitmapData(this.rsw,this.rsh);
               this.pausebmd.draw(stage);
               this.pausebm = new Bitmap(this.pausebmd);
               this.pauseS.bg.addChild(this.pausebm);
               this.pause = true;
               this.pauseS.visible = true;
               setChildIndex(this.pauseS,numChildren - 1);
            }
            else
            {
               this.pause = false;
               this.pauseS.visible = false;
            }
         }
      }
      
      private function restart() : void
      {
         this.transitioner.transite();
         this.Clear();
         this.launchGame();
         setChildIndex(this.tran,numChildren - 1);
      }
      
      private function downed(param1:KeyboardEvent) : void
      {
         var _loc2_:int = 0;
         if(param1.keyCode == 38)
         {
            this.player.up = true;
         }
         else if(param1.keyCode == 40)
         {
            this.player.down = true;
         }
         if(param1.keyCode == 32)
         {
            if(this.starting)
            {
               this.paralyzed = 20;
               this.sTree.kicker.leg.lega.gotoAndStop(2);
               this.sTree.kicker.leg.stop();
               _loc2_ = (this.sTree.kicker.leg.bar.blip.height + 100) * 0.07 * this.bootPower;
               this.player.vx = -Math.cos(this.anglekicker) * _loc2_;
               this.player.vy = -Math.sin(this.anglekicker) * _loc2_;
               this.createFX(this.player,15);
               this.createEFX(1.5);
               this.playSound("punchsound",4);
               this.playSound("chicksound",3);
               this.starting = false;
               this.player.visible = true;
               this.sTree.birda.visible = false;
            }
            else if(globalVars.rocket != "none" && this.fuel > 0)
            {
               this.rocket = true;
            }
         }
      }
      
      private function createBird() : void
      {
         var _loc1_:MovieClip = null;
         if(this.player == null)
         {
            this.player = new Bird();
         }
         this.player.gotoAndStop(1);
         this.player.bird.rak.gotoAndStop(globalVars.rocket);
         this.player.bird.head.head.helm.gotoAndStop(globalVars.helmet);
         this.player.bird.belt.gotoAndStop(globalVars.belt);
         _loc1_ = this.player.bird.head.head.helm;
         if(!isNaN(_loc1_.mood))
         {
            this.maxEnergy = 50 + _loc1_.mood * 2.8;
            this.protect += _loc1_.prot * 0.065;
         }
         _loc1_ = this.player.bird.belt;
         if(!isNaN(_loc1_.prot))
         {
            this.protect += _loc1_.prot * 0.065;
            this.weight += _loc1_.weight * 0.8;
         }
         _loc1_ = this.player.bird.rak;
         if(!isNaN(_loc1_.weight))
         {
            this.weight += _loc1_.weight * 0.8;
         }
         this.player.x = 250;
         this.player.y = 200;
         this.con.addChild(this.player);
      }
      
      private function update(param1:Event) : void
      {
         var _loc4_:bItem = null;
         var _loc5_:Point = null;
         var _loc6_:Number = NaN;
         var _loc7_:Number = NaN;
         if(this.waiting > 0)
         {
            --this.waiting;
         }
         if(this.optionsmenu.visible)
         {
            setChildIndex(this.optionsmenu,numChildren - 1);
         }
         if(this.pause)
         {
            return;
         }
         var _loc2_:int = 0;
         var _loc3_:* = int(this.newItems.length);
         while(_loc2_ < _loc3_)
         {
            _loc4_ = this.newItems[_loc2_];
            _loc4_.x -= (_loc4_.x - _loc4_.width * _loc2_) * 0.3;
            if(_loc4_.i == 80)
            {
               _loc4_.alpha -= 0.1;
            }
            else
            {
               if(_loc4_.alpha < 1)
               {
                  _loc4_.alpha += 0.25;
               }
               ++_loc4_.i;
            }
            if(_loc4_.alpha <= 0)
            {
               _HUD.newitem.newitems.removeChild(_loc4_);
               this.newItems.splice(_loc2_,1);
               _loc3_--;
            }
            _loc2_++;
         }
         _loc2_ = 0;
         if(this.hitCounter > 0)
         {
            --this.hitCounter;
         }
         else
         {
            this.oldHit = 0;
         }
         if(this.cashier.visible)
         {
            if(this.cashieri == 0)
            {
               this.cashier.visible = false;
               this.cashieri = 80;
               this.cashier.gotoAndStop(1);
               this.cashier.alpha = 1;
            }
            else
            {
               --this.cashieri;
               if(this.cashieri < 30)
               {
                  this.cashier.alpha -= 1 / 30;
               }
            }
         }
         if(this.starting)
         {
            this.pttkicker.x = this.sTree.kicker.leg.lega.x;
            this.pttkicker.y = this.sTree.kicker.leg.lega.y;
            _loc5_ = this.sTree.kicker.leg.localToGlobal(this.pttkicker);
            _loc6_ = Math.atan2(_loc5_.y - mouseY,_loc5_.x - mouseX);
            _loc7_ = _loc6_ * this.toDeg + 180;
            if(!(_loc7_ < 290 && _loc7_ > 80))
            {
               this.anglekicker = _loc6_;
               this.sTree.kicker.leg.lega.rotation = this.anglekicker * this.toDeg + 90;
               this.sTree.arrow.rotation = this.sTree.kicker.leg.lega.rotation;
            }
            else if(Math.abs(this.sTree.kicker.leg.lega.rotation + 10) < Math.abs(this.sTree.kicker.leg.lega.rotation + 160))
            {
               this.sTree.kicker.leg.lega.rotation = -10;
            }
            else
            {
               this.sTree.kicker.leg.lega.rotation = -160;
            }
         }
         this.updateSceneary();
         if(this.starting)
         {
            return;
         }
         this.updateBird();
         ++this.playTime;
         this.updateHUD();
         switch(this.unlockCount)
         {
            case 1:
               if(this.distance > 250)
               {
                  this.unlock("wbelt","ubelt");
                  this.unlock("smileyface","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 2:
               if(this.distance > 350)
               {
                  this.unlock("swings","urocket");
                  ++this.unlockCount;
               }
               break;
            case 3:
               if(this.distance > 370)
               {
                  this.unlock("gnycap","uhelmet");
                  this.unlock("rnycap","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 4:
               if(this.distance > 400)
               {
                  this.unlock("swings2","urocket");
                  ++this.unlockCount;
               }
               break;
            case 5:
               if(this.distance > 500)
               {
                  this.unlock("sbelt","ubelt");
                  this.unlock("sbeltblack","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 6:
               if(this.distance > 620)
               {
                  this.unlock("gmban","uhelmet");
                  this.unlock("wmban","uhelmet");
                  this.unlock("bmban","uhelmet");
                  this.unlock("blmban","uhelmet");
                  this.unlock("rmban","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 7:
               if(this.distance > 650)
               {
                  this.unlock("tnt","urocket");
                  ++this.unlockCount;
               }
               break;
            case 8:
               if(this.distance > 700)
               {
                  this.unlock("longrakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 9:
               if(this.distance > 850)
               {
                  this.unlock("pilbelt","ubelt");
                  this.unlock("pilbeltblack","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 10:
               if(this.distance > 900)
               {
                  this.unlock("bhue","uhelmet");
                  this.unlock("rhue","uhelmet");
                  this.unlock("whue","uhelmet");
                  this.unlock("ghue","uhelmet");
                  this.unlock("blhuea","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 11:
               if(this.distance > 1000)
               {
                  this.unlock("longrakket2","urocket");
                  ++this.unlockCount;
               }
               break;
            case 12:
               if(this.distance > 1200)
               {
                  this.unlock("gcap","uhelmet");
                  this.unlock("bcap","uhelmet");
                  this.unlock("wcap","uhelmet");
                  this.unlock("blcap","uhelmet");
                  this.unlock("rcap","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 13:
               if(this.distance > 1300)
               {
                  this.unlock("rakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 14:
               if(this.distance > 1500)
               {
                  this.unlock("smileybelt2","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 15:
               if(this.distance > 1550)
               {
                  this.unlock("wglass","uhelmet");
                  this.unlock("bglass","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 16:
               if(this.distance > 1600)
               {
                  this.unlock("bwings","urocket");
                  ++this.unlockCount;
               }
               break;
            case 17:
               if(this.distance > 1750)
               {
                  this.unlock("altbelt","ubelt");
                  this.unlock("altbeltblack","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 18:
               if(this.distance > 1800)
               {
                  this.unlock("bwings2","urocket");
                  ++this.unlockCount;
               }
               break;
            case 19:
               if(this.distance > 1850)
               {
                  this.unlock("bjew","uhelmet");
                  this.unlock("wjew","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 20:
               if(this.distance > 1950)
               {
                  this.unlock("wban","uhelmet");
                  this.unlock("bban","uhelmet");
                  this.unlock("rban","uhelmet");
                  this.unlock("gban","uhelmet");
                  this.unlock("blban","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 21:
               if(this.distance > 2000)
               {
                  this.unlock("brakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 22:
               if(this.distance > 2050)
               {
                  this.unlock("accbeltblack","ubelt");
                  this.unlock("accbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 23:
               if(this.distance > 2150)
               {
                  this.unlock("rbackcap","uhelmet");
                  this.unlock("bbackcap","uhelmet");
                  this.unlock("blbackcap","uhelmet");
                  this.unlock("gbackcap","uhelmet");
                  this.unlock("wbackcap","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 24:
               if(this.distance > 2200)
               {
                  this.unlock("3rakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 25:
               if(this.distance > 2400)
               {
                  this.unlock("toolbelt","ubelt");
                  this.unlock("toolbeltblack","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 26:
               if(this.distance > 2500)
               {
                  this.unlock("wlhue","uhelmet");
                  this.unlock("rlhue","uhelmet");
                  this.unlock("glhue","uhelmet");
                  this.unlock("bllhue","uhelmet");
                  this.unlock("blhue","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 27:
               if(this.distance > 2600)
               {
                  this.unlock("3rakket2","urocket");
                  ++this.unlockCount;
               }
               break;
            case 28:
               if(this.distance > 2700)
               {
                  this.unlock("jason","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 29:
               if(this.distance > 2750)
               {
                  this.unlock("bbeltblack","ubelt");
                  this.unlock("bbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 30:
               if(this.distance > 2800)
               {
                  this.unlock("rbelt","ubelt");
                  this.unlock("awesomeface","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 31:
               if(this.distance > 2900)
               {
                  this.unlock("rbancomb","uhelmet");
                  this.unlock("gbancomb","uhelmet");
                  this.unlock("wbancomb","uhelmet");
                  this.unlock("bbancomb","uhelmet");
                  this.unlock("blbancomb","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 32:
               if(this.distance > 3000)
               {
                  this.unlock("illurakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 33:
               if(this.distance > 3100)
               {
                  this.unlock("smileybelt3","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 34:
               if(this.distance > 3250)
               {
                  this.unlock("ohelm","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 35:
               if(this.distance > 3400)
               {
                  this.unlock("seedbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 36:
               if(this.distance > 3500)
               {
                  this.unlock("illurakket2","urocket");
                  ++this.unlockCount;
               }
               break;
            case 37:
               if(this.distance > 3600)
               {
                  this.unlock("bsunglass","uhelmet");
                  this.unlock("rsunglass","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 38:
               if(this.distance > 3700)
               {
                  this.unlock("smallironbeltblack","ubelt");
                  this.unlock("smallironbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 39:
               if(this.distance > 3850)
               {
                  this.unlock("abu","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 40:
               if(this.distance > 4000)
               {
                  this.unlock("ironbelt","ubelt");
                  this.unlock("ironbeltblack","ubelt");
                  this.unlock("mine","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 41:
               if(this.distance > 4250)
               {
                  this.unlock("bheadset","uhelmet");
                  this.unlock("wheadset","uhelmet");
                  this.unlock("rheadset","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 42:
               if(this.distance > 4400)
               {
                  this.unlock("facebelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 43:
               if(this.distance > 4500)
               {
                  this.unlock("hrakket","urocket");
                  ++this.unlockCount;
               }
               break;
            case 44:
               if(this.distance > 4550)
               {
                  this.unlock("næb","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 45:
               if(this.distance > 4600)
               {
                  this.unlock("ironbelt2black","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 46:
               if(this.distance > 4700)
               {
                  this.unlock("rrace","uhelmet");
                  this.unlock("brace","uhelmet");
                  this.unlock("goldrace","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 47:
               if(this.distance > 4800)
               {
                  this.unlock("blackbelt","ubelt");
                  this.unlock("faic","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 48:
               if(this.distance > 5000)
               {
                  this.unlock("halsting","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 49:
               if(this.distance > 5200)
               {
                  this.unlock("ironbelt3black","ubelt");
                  this.unlock("ironbelt3","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 50:
               if(this.distance > 5400)
               {
                  this.unlock("mili","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 51:
               if(this.distance > 5600)
               {
                  this.unlock("armorbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 52:
               if(this.distance > 5800)
               {
                  this.unlock("rkong","uhelmet");
                  this.unlock("bkong","uhelmet");
                  this.unlock("wkong","uhelmet");
                  this.unlock("madness","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 53:
               if(this.distance > 6000)
               {
                  this.unlock("bigironbelt","ubelt");
                  ++this.unlockCount;
               }
               break;
            case 54:
               if(this.distance > 6150)
               {
                  this.unlock("illuface","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 55:
               if(this.distance > 6300)
               {
                  this.unlock("mand","uhelmet");
                  ++this.unlockCount;
               }
               break;
            case 56:
               if(this.distance > 6400)
               {
                  this.unlock("pac","uhelmet");
                  ++this.unlockCount;
               }
         }
         if(this.sTree.visible)
         {
            if(-this.container.x > 1500)
            {
               this.sTree.visible = false;
            }
         }
         if(!mobile)
         {
            if(this.player.vx > 90)
            {
               this.fx.alpha -= (this.fx.alpha - this.player.vx / 250 * 1.2) * 0.2;
            }
            else
            {
               this.fx.alpha -= this.fx.alpha * 0.3;
            }
            if(this.fx.alpha > 0)
            {
               this.fx.visible = true;
               if(this.fx.alpha < 0.1)
               {
                  this.fx.alpha = 0;
                  this.fx.visible = false;
               }
               this.fx.rotation = this.player.rotation;
            }
         }
      }
      
      private function unlock(param1:String, param2:String) : void
      {
         var _loc3_:MovieClip = null;
         var _loc4_:Vector.<String> = null;
         if(param2 != "boot")
         {
            _loc4_ = globalVars[param2];
            if(_loc4_.indexOf(param1) == -1)
            {
               _loc4_.push(param1);
               if(param2 == "urocket")
               {
                  globalVars.ftR[_loc4_.indexOf(param1)] = 0;
               }
               else if(param2 == "uhelmet")
               {
                  globalVars.ftH[_loc4_.indexOf(param1)] = 0;
               }
               else if(param2 == "ubelt")
               {
                  globalVars.ftB[_loc4_.indexOf(param1)] = 0;
               }
               _HUD.newitem.gotoAndPlay(2);
               _loc3_ = new bItem();
               _HUD.newitem.newitems.addChild(_loc3_);
               this.newItems.push(_loc3_);
               _loc3_.alpha = 0;
               _loc3_.x = -50;
               _loc3_.scaleX = 0.75;
               _loc3_.scaleY = 0.75;
               if(param2 == "uhelmet")
               {
                  globalVars.newHelmet = true;
                  _loc3_.gotoAndStop("helmets");
                  _loc3_.helm.gotoAndStop(param1);
               }
               else if(param2 == "ubelt")
               {
                  globalVars.newBelt = true;
                  _loc3_.gotoAndStop("belts");
                  _loc3_.belt.gotoAndStop(param1);
               }
               else if(param2 == "urocket")
               {
                  _loc3_.gotoAndStop("rockets");
                  _loc3_.rak.gotoAndStop(param1);
               }
               _loc3_.nonetext.visible = false;
            }
         }
         else if(globalVars.boots.indexOf(param1) == -1)
         {
            _HUD.newitem.gotoAndPlay(2);
            _loc3_ = new bItem();
            _HUD.newitem.newitems.addChild(_loc3_);
            this.newItems.push(_loc3_);
            _loc3_.alpha = 0;
            _loc3_.x = -50;
            _loc3_.scaleX = 0.75;
            _loc3_.scaleY = 0.75;
            _loc3_.gotoAndStop("boots");
            _loc3_.boots.gotoAndStop(param1);
            globalVars.boot = param1;
            globalVars.boots.push(param1);
         }
      }
      
      private function updateFX() : void
      {
         var _loc3_:FX = null;
         var _loc4_:FXBMD = null;
         var _loc5_:Number = NaN;
         var _loc6_:Number = NaN;
         var _loc7_:int = 0;
         var _loc1_:int = 0;
         _loc1_ = 0;
         var _loc2_:int = 0;
         while(_loc2_ < 30)
         {
            _loc3_ = this.fxPool[_loc2_];
            if(_loc3_ != null)
            {
               if(_loc3_.active == 1)
               {
                  if(_loc3_.time > 0)
                  {
                     if(_loc3_.delay == _loc3_.i || _loc3_.delay == 0)
                     {
                        _loc5_ = Math.random() * 70 - 35;
                        _loc6_ = Math.round(Math.random());
                        _loc4_ = this.sheets[_loc3_.sheet];
                        this.pt2.x = _loc3_.follow.x + _loc5_ - _loc4_.rad - this.fxbm.x;
                        this.pt2.y = _loc3_.follow.y + _loc5_ - _loc4_.rad - this.fxbm.y;
                        if(_loc4_.time == 1)
                        {
                           _loc7_ = int((_loc3_.time - 1) * 0.1 + 0.5);
                           if(_loc7_ > _loc4_.tiles)
                           {
                              _loc7_ = _loc4_.tiles - 1;
                           }
                           _loc4_.rect.x = _loc4_.wid * (_loc7_ - 1);
                        }
                        else
                        {
                           _loc4_.rect.x = _loc4_.wid * Math.round(Math.random() * (_loc4_.tiles - 1));
                        }
                        --_loc3_.time;
                        if(_loc4_.blur)
                        {
                           this.fxbmd.copyPixels(_loc4_.bmd,_loc4_.rect,this.pt2,null,null,true);
                        }
                        else
                        {
                           this.fxbmd2.copyPixels(_loc4_.bmd,_loc4_.rect,this.pt2,null,null,true);
                        }
                        if(_loc6_ == 1)
                        {
                           this.fxbmd3.copyPixels(_loc4_.bmd,_loc4_.rect,this.pt2,null,null,true);
                        }
                        _loc3_.i = 0;
                     }
                     else
                     {
                        ++_loc3_.i;
                     }
                  }
                  else
                  {
                     if(_loc3_ == this.booster)
                     {
                        this.booster = null;
                     }
                     if(this.feathers == _loc3_)
                     {
                        this.feathers = null;
                     }
                     if(this.speedFire == _loc3_)
                     {
                        this.speedFire = null;
                     }
                     this.fxPool[_loc2_].active = 0;
                     this.fxPlace = _loc2_;
                  }
               }
            }
            _loc2_++;
         }
         this.pts = this.clearArr(this.pts);
         if(this.interval == 0)
         {
            if(!mobile)
            {
               this.rect4.x = -this.fxbm.x;
               this.rect4.y = -this.fxbm.y;
               this.fxbmd.colorTransform(this.rect4,this.cTransform);
               this.fxbmd2.colorTransform(this.rect4,this.cTransform2);
               this.fxbmd3.colorTransform(this.rect4,this.cTransform);
            }
            if(mobile)
            {
               this.interval = 5;
            }
            else
            {
               this.interval = 3;
            }
         }
         else
         {
            --this.interval;
         }
      }
      
      private function clearArr(param1:Vector.<Number>) : Vector.<Number>
      {
         while(param1.length > 0)
         {
            param1.pop();
         }
         return param1;
      }
      
      private function updateHUD() : void
      {
         if(globalVars.rocket != "none")
         {
            _HUD.fuel.bar.width = this.fuel / this.maxFuel * 334;
         }
         _HUD.bar.bar.width = this.energy / this.maxEnergy * 304;
         _HUD.feet.text = int(this.distance) + " FT";
         if(this.testing)
         {
            this.fuel = this.maxFuel;
            this.energy = this.maxEnergy;
         }
      }
      
      private function updateSceneary() : void
      {
         var _loc1_:int = 0;
         var _loc2_:Cloud = null;
         var _loc3_:Power = null;
         var _loc4_:int = 0;
         var _loc5_:Obstacle = null;
         var _loc6_:int = 0;
         var _loc7_:Number = NaN;
         var _loc8_:Number = NaN;
         if(this.winning)
         {
            return;
         }
         if(this.cRan <= 0)
         {
            this.createCloud();
         }
         else
         {
            --this.cRan;
         }
         if(this.pRan <= 0)
         {
            this.createPower();
         }
         else
         {
            --this.pRan;
         }
         if(this.sceneInterval == 0)
         {
            this.sceneInterval = 1;
            _loc1_ = 0;
            while(_loc1_ < this.cLen)
            {
               _loc2_ = this.cPool[_loc1_];
               if(_loc2_.visible)
               {
                  if(_loc2_.x + this.cloudc.x + _loc2_.width < 0)
                  {
                     this.cPlace = _loc1_;
                     --this.cRan;
                     _loc2_.visible = false;
                     break;
                  }
               }
               _loc1_++;
            }
            _loc1_ = 0;
            while(_loc1_ < this.pLen)
            {
               _loc3_ = this.pPool[_loc1_];
               if(_loc3_.visible)
               {
                  if(_loc3_.x + this.container.x + _loc3_.width < 0 && _loc3_.i == 0)
                  {
                     this.pPlace = _loc1_;
                     _loc3_.i = Math.random() * 100 + 50;
                     _loc3_.visible = false;
                     _loc4_ = Math.ceil(Math.random() * 50);
                     if(_loc4_ < 47)
                     {
                        _loc3_.gotoAndStop(int(Math.random() * 3 + 1));
                     }
                     else
                     {
                        _loc6_ = Math.random() * 3 + 5;
                        _loc3_.gotoAndStop(_loc6_);
                     }
                     _loc3_.power = _loc3_.currentLabel;
                     --this.pRan;
                     break;
                  }
                  if(_loc3_.i != 0)
                  {
                     --_loc3_.i;
                  }
                  this.colScaleX = _loc3_.scaleX;
                  this.colScaleY = _loc3_.scaleY;
                  if(this.player.vx > 85)
                  {
                     _loc3_.scaleX *= this.player.vx * 0.04;
                  }
                  if(this.player.vy > 85)
                  {
                     _loc3_.scaleY *= this.player.vy * 0.04;
                  }
                  if(_loc3_.hitTestObject(this.player))
                  {
                     --this.pRan;
                     switch(_loc3_.power)
                     {
                        case "boost":
                           this.createFX(this.player,30,true);
                           this.player.vy -= 10;
                           this.player.vx += 20;
                           this.energy += this.maxEnergy * 0.33;
                           this.addCash(150);
                           break;
                        case "boost2":
                           this.createFX(this.player,40,true);
                           this.player.vy -= 20;
                           this.player.vx += 35;
                           this.energy += this.maxEnergy * 0.55;
                           this.addCash(250);
                           break;
                        case "benzin":
                           this.createFX(this.player,15,true);
                           this.fuel += this.maxFuel * 0.33;
                           this.player.vy -= 10;
                           this.player.vx += 20;
                           this.energy += 10;
                           this.addCash(100);
                           break;
                        case "benzin2":
                           this.createFX(this.player,15,true);
                           this.fuel += this.maxFuel * 0.55;
                           this.player.vy -= 15;
                           this.player.vx += 30;
                           this.energy += 20;
                           this.addCash(200);
                           break;
                        case "diamond":
                           this.createFX(this.player,15,true);
                           this.player.vy -= 15;
                           this.player.vx += 30;
                           this.energy += 20;
                           this.addCash(500);
                           this.addCash(500);
                           break;
                        case "diamond2":
                           this.createFX(this.player,15,true);
                           this.fuel += this.maxFuel * 0.55;
                           this.player.vy -= 15;
                           this.player.vx += 30;
                           this.energy += 20;
                           this.addCash(800);
                           break;
                        case "diamond3":
                           this.createFX(this.player,15,true);
                           this.fuel += this.maxFuel * 0.55;
                           this.player.vy -= 15;
                           this.player.vx += 30;
                           this.energy += 20;
                           this.addCash(1000);
                           break;
                        case "diamond4":
                           this.createFX(this.player,15,true);
                           this.fuel += this.maxFuel * 0.55;
                           this.player.vy -= 15;
                           this.player.vx += 30;
                           this.energy += 20;
                           this.addCash(1100);
                     }
                     _loc3_.scaleX = this.colScaleX;
                     _loc3_.scaleY = this.colScaleY;
                     this.createEFX(1.5);
                     this.pPlace = _loc1_;
                     _loc3_.visible = false;
                     break;
                  }
                  _loc3_.scaleX = this.colScaleX;
                  _loc3_.scaleY = this.colScaleY;
               }
               _loc1_++;
            }
            _loc1_ = 0;
            if(this.obRan <= 0)
            {
               this.obRan = Math.random() * 20 + 10;
               _loc5_ = this.obPool[this.obPlace];
               if(!_loc5_.visible)
               {
                  if(_loc5_.currentFrame == 7 && (this.container.y < 5000 || this.container.y > 100000))
                  {
                     _loc5_.gotoAndStop(Math.random() * 6);
                  }
                  _loc5_.visible = true;
                  _loc5_.y = Math.random() * (this.rsh + 400) - 200 - this.container.y + this.player.vy * 3 + _loc5_.height;
                  if(_loc5_.y - this.top > -50)
                  {
                     _loc5_.y -= 100;
                  }
                  if(_loc5_.y > 1800)
                  {
                     _loc5_.y = 1800;
                     _loc5_.y -= 100;
                  }
                  if(_loc5_.y + this.container.y > 0 && _loc5_.y + this.container.y < this.rsh)
                  {
                     _loc5_.x = this.rsw + Math.random() * 150 + 2 * this.player.vx + _loc5_.width - this.container.x;
                  }
                  else
                  {
                     _loc5_.x = Math.random() * (this.rsw + 200) + _loc5_.width + this.player.vx * 2 - this.container.x;
                  }
               }
            }
            else
            {
               --this.obRan;
               if(this.obRan < 0)
               {
                  this.obRan = 0;
               }
            }
            while(_loc1_ < this.obLen)
            {
               _loc5_ = this.obPool[_loc1_];
               if(_loc5_.visible)
               {
                  if(_loc5_.x + this.container.x + _loc5_.width < 0)
                  {
                     this.obPlace = _loc1_;
                     _loc5_.visible = false;
                     _loc5_.gotoAndStop(int(Math.random() * 7));
                     _loc5_.type = _loc5_.currentLabel;
                     break;
                  }
                  if(this.hurt == 0)
                  {
                     this.colScaleX = _loc5_.scaleX;
                     this.colScaleY = _loc5_.scaleY;
                     if(this.player.vx > 105)
                     {
                        _loc5_.scaleX *= this.player.vx * 0.04;
                     }
                     else if(this.player.vy > 105)
                     {
                        _loc5_.scaleY *= this.player.vy * 0.04;
                     }
                     if(_loc5_.hitTestObject(this.player))
                     {
                        this.createFX(this.player,30,true);
                        this.player.vy += 40 / (this.protect * 1.3);
                        _loc7_ = this.protect * 0.42 + 0.13;
                        if(_loc7_ > 1.6)
                        {
                           _loc7_ = 1.6;
                        }
                        if(this.screaming == 0)
                        {
                           this.playSound("chicksound",3);
                           this.screaming = 5;
                        }
                        _loc8_ = this.protect + 1;
                        this.player.vx *= 0.6 * _loc7_;
                        this.paralyzed += 20 / _loc8_;
                        this.hurt += 90 / _loc8_;
                        this.energy -= this.maxEnergy * 0.6 / _loc8_;
                        this.fuel -= this.maxFuel * 0.6 / _loc8_;
                        this.createEFX(1.5);
                        this.playSound("punchsound",3);
                        this.obPlace = _loc1_;
                        _loc5_.visible = false;
                        _loc5_.scaleX = this.colScaleX;
                        _loc5_.scaleY = this.colScaleY;
                        break;
                     }
                     _loc5_.scaleX = this.colScaleX;
                     _loc5_.scaleY = this.colScaleY;
                  }
               }
               _loc1_++;
            }
         }
         else
         {
            --this.sceneInterval;
         }
         _loc1_ = 0;
      }
      
      private function addCash(param1:int) : void
      {
         this.cashier.visible = true;
         this.cashier.gotoAndPlay(1);
         this.cashier.play();
         this.cashier.x = this.player.x;
         this.cashier.y = this.player.y;
         this.cashieri = 80;
         this.cashier.alpha = 1;
         if(this.oldHit != 0)
         {
            ++this.oldHit;
            this.hitCounter = 50;
            this.cashier.cash.txt.text = "+$" + param1 + " X" + this.oldHit * 0.75;
            globalVars.cash += param1 * (this.oldHit * 0.75);
         }
         else
         {
            ++this.oldHit;
            this.hitCounter = 50;
            globalVars.cash += param1;
            this.cashier.cash.txt.text = "+$" + param1;
         }
         this.bonus += param1;
      }
      
      private function createEFX(param1:Number) : void
      {
         if(globalVars.mobile)
         {
            if(this.nQuality != "high")
            {
               return;
            }
         }
         var _loc2_:eFX = this.efxpool[this.efxcurrent];
         var _loc3_:int = Math.round(Math.random() * (_loc2_.totalFrames - 2)) + 2;
         _loc2_.gotoAndStop(_loc3_);
         this.container.addChild(_loc2_);
         _loc2_.x = this.player.x - this.container.x;
         _loc2_.y = this.player.y - this.container.y;
         _loc2_.scaleX = param1;
         _loc2_.scaleY = param1;
         _loc2_.visible = true;
         this.container.setChildIndex(_loc2_,this.container.numChildren - 1);
         if(this.efxcurrent < 9)
         {
            ++this.efxcurrent;
         }
         else
         {
            this.efxcurrent = 0;
         }
      }
      
      private function createFX(param1:*, param2:int, param3:Boolean = false, param4:int = 0, param5:int = 0) : FX
      {
         var _loc6_:FX = null;
         if(globalVars.mobile)
         {
            if(this.nQuality != "high")
            {
               return null;
            }
         }
         _loc6_ = this.fxPool[this.fxPlace];
         _loc6_.delay = param5;
         _loc6_.follow = param1;
         _loc6_.time = param2;
         _loc6_.sheet = param4;
         _loc6_.active = 1;
         if(this.fxPlace == 29)
         {
            this.fxPlace = 0;
         }
         else
         {
            ++this.fxPlace;
         }
         return _loc6_;
      }
      
      private function createPower() : void
      {
         var _loc1_:Power = null;
         _loc1_ = this.pPool[this.pPlace];
         if(_loc1_.visible)
         {
            return;
         }
         this.pRan = Math.random() * 30 + 10;
         _loc1_.visible = true;
         var _loc2_:Number = Math.ceil(Math.random() * 30);
         if(_loc2_ < 20)
         {
            _loc1_.gotoAndStop(int(Math.random() * 3 + 1));
         }
         else
         {
            _loc1_.gotoAndStop(int(Math.random() * 3 + 5));
         }
         _loc1_.power = _loc1_.currentLabel;
         _loc1_.y = Math.random() * (this.rsh + 400) - 200 - this.container.y + this.player.vy * 3 + _loc1_.height;
         if(_loc1_.y - this.top > -50)
         {
            _loc1_.y -= 100;
         }
         if(_loc1_.y > 1800)
         {
            _loc1_.y = 1800;
            _loc1_.y -= 100;
         }
         if(_loc1_.y + this.container.y > 0 && _loc1_.y + this.container.y < this.rsh)
         {
            _loc1_.x = this.rsw + Math.random() * 150 + 2 * this.player.vx + _loc1_.width - this.container.x;
         }
         else
         {
            _loc1_.x = Math.random() * (this.rsw + 200) + _loc1_.width + this.player.vx * 2 - this.container.x;
         }
      }
      
      private function createCloud() : void
      {
         var _loc1_:Cloud = null;
         if(this.player.y > 300 || this.heighta > -300)
         {
            return;
         }
         _loc1_ = this.cPool[this.cPlace];
         if(_loc1_.visible)
         {
            this.cPlace = 0;
            if(this.cPlace < 15)
            {
               _loc1_ = this.cPool[this.cPlace];
               if(_loc1_.visible)
               {
                  return;
               }
            }
         }
         _loc1_.visible = true;
         if(this.container.y < 50000 || this.container.y > 100000)
         {
            _loc1_.gotoAndStop(Math.ceil(Math.random() * 3) + 1);
            this.cRan = Math.random() * 10 + 10;
         }
         else
         {
            _loc1_.gotoAndStop(Math.ceil(Math.random() * 3) + 4);
            this.cRan = Math.random() * 60 + 30;
         }
         var _loc2_:Number = Math.random() * 2 + 0.5;
         _loc1_.scaleX = _loc2_;
         _loc1_.scaleY = _loc2_;
         _loc1_.y = Math.random() * (this.rsh + 400) - 200 - this.cloudc.y + this.player.vy * 3 + _loc1_.height * this.dir;
         if(_loc1_.y > 1000)
         {
            _loc1_.y = 1000 - Math.random() * 500;
         }
         if(_loc1_.y + this.cloudc.y > 0 && _loc1_.y + this.cloudc.y < this.rsh)
         {
            _loc1_.x = this.rsw + Math.random() * 150 + 2 * this.player.vx + _loc1_.width - this.cloudc.x;
         }
         else
         {
            _loc1_.x = Math.random() * (this.rsw + 200) + _loc1_.width + this.player.vx * 2 - this.cloudc.x;
         }
      }
      
      private function updateCam() : void
      {
      }
      
      private function playSound(param1:String, param2:int) : void
      {
         var _loc3_:int = Math.round(Math.random() * (param2 - 1)) + 1;
         var _loc4_:Sound = this[param1 + _loc3_];
         this.fxchannel = _loc4_.play();
         this.fxchannel.soundTransform = this.fxTransform;
      }
      
      private function updateBird() : void
      {
         var _loc1_:Number = NaN;
         var _loc2_:Number = NaN;
         var _loc3_:Number = NaN;
         var _loc4_:int = 0;
         var _loc5_:int = 0;
         var _loc6_:* = undefined;
         var _loc7_:Number = NaN;
         var _loc8_:* = undefined;
         if(this.winning)
         {
            if(!this.scoring)
            {
               ++this.gameTimes;
               switch(this.gameTimes)
               {
                  case 5:
                     this.unlock("boota","boot");
                     break;
                  case 13:
                     this.unlock("bootb","boot");
                     break;
                  case 26:
                     this.unlock("bootc","boot");
               }
               this.ScoreB.visible = true;
               _HUD.fuel.visible = false;
               _HUD.bar.visible = false;
               _HUD.feet.visible = false;
               _HUD.con.visible = false;
               this.ScoreB.Set(this.distance,this.heighestPoint >> 1,this.playTime / this.frameRate,this.bonus);
               this.scoring = true;
            }
            this.ScoreB.Update();
            this.ScoreB.sc.x -= (this.ScoreB.sc.x - 100) * 0.25;
            return;
         }
         if(this.stillTime > 30)
         {
            if(this.player.currentFrame != 2)
            {
               this.player.gotoAndStop(2);
            }
            else if(this.player.bird.currentFrame == 25)
            {
               this.winning = true;
            }
            else
            {
               this.player.bird.helmb.gotoAndStop(globalVars.helmet);
               this.player.bird.helmc.gotoAndStop(globalVars.helmet);
               this.player.bird.helm.gotoAndStop(globalVars.helmet);
               this.player.bird.rak.gotoAndStop(globalVars.rocket);
               this.player.bird.belt.gotoAndStop(globalVars.belt);
            }
         }
         if(this.player.currentFrame == 2)
         {
            return;
         }
         if(this.energy > this.maxEnergy)
         {
            this.energy = this.maxEnergy;
         }
         else if(this.energy < 0)
         {
            this.energy = 0;
         }
         if(this.fuel > this.maxFuel)
         {
            this.fuel = this.maxFuel;
         }
         else if(this.fuel < 0)
         {
            this.fuel = 0;
         }
         if(this.player != null)
         {
            if(this.paralyzed == 0)
            {
               if(this.playerInterval == 0)
               {
                  if(globalVars.rocket != "none")
                  {
                     if(this.rocket)
                     {
                        if(this.fuel <= 0)
                        {
                           this.rocket = false;
                           this.player.power = 0;
                           this.player.bird.rak.ra.gotoAndStop("sluk");
                        }
                        else
                        {
                           if(this.rocketCounter == 0)
                           {
                              this.fxchannel = this.rocketsound1.play();
                              this.rocketCounter = 5;
                           }
                           if(globalVars.rocket == "tnt")
                           {
                              this.createEFX(1.5);
                           }
                           this.player.bird.rak.ra.gotoAndStop("tændt");
                           --this.fuel;
                           this.player.power = this.player.bird.rak.intensitet * 0.0148;
                        }
                     }
                     else
                     {
                        this.player.bird.rak.ra.gotoAndStop("sluk");
                        this.player.power = 0;
                     }
                  }
                  if(this.rocketCounter != 0)
                  {
                     --this.rocketCounter;
                  }
               }
               if(this.player.vx > 30 && this.feathers == null)
               {
                  this.feathers = this.createFX(this.player,1,true,2,7);
               }
               if(this.speedFire == null)
               {
                  if(this.player.vx > 90 && this.player.vy > 20)
                  {
                     this.speedFire = this.createFX(this.player,10,true,4);
                  }
               }
               if(this.booster == null)
               {
                  if(this.rocket)
                  {
                     if(this.player.bird.rak.currentLabel != "bwings")
                     {
                        this.booster = this.createFX(this.player,10,true,3);
                     }
                  }
               }
            }
            if(!this.goPlayer)
            {
               this.player.y -= (this.player.y - 200) * 0.3;
            }
            if(this.paralyzed == 0)
            {
               if(this.player.down)
               {
                  if(Math.abs(this.player.vy) > 2)
                  {
                     this.player.vx += 0.6;
                     if(this.player.vy < -2)
                     {
                        this.player.vy -= this.player.vy * 0.3 / Math.abs(this.player.vy * 0.1);
                     }
                     ++this.player.vy;
                  }
               }
               else if(this.player.up && this.energy > 0)
               {
                  --this.energy;
                  if(this.player.vy > 2)
                  {
                     this.player.vy -= this.player.vy * 0.1 / Math.abs(this.player.vy * 0.1);
                  }
                  --this.player.vy;
                  this.player.vx += 0.2;
               }
            }
            else
            {
               --this.paralyzed;
            }
            if(this.hurt != 0)
            {
               this.player.alpha = 0.42;
               --this.hurt;
            }
            else
            {
               this.player.alpha = 1;
            }
            this.player.vy += (this.weight * 0.004 / (this.player.vx * 0.015 + 1) + this.gravity / (this.player.vx * 0.015 + 1)) / (this.player.power + 1);
            this.atan = Math.atan2(-this.player.vy,this.player.vx);
            _loc1_ = Math.atan2(this.player.vy,this.player.vx);
            if(this.screaming > 0)
            {
               --this.screaming;
            }
            if(this.grounding > 0)
            {
               --this.grounding;
            }
            if(this.goPlayer)
            {
               if(this.player.y >= 300 + this.xtra)
               {
                  _loc4_ = Math.sqrt(this.player.vx * this.player.vx + this.player.vy * this.player.vy);
                  if(_loc4_ > 5)
                  {
                     this.createFX(this.player,_loc4_ * 0.2,false,1);
                     this.createFX(this.player,_loc4_ * 0.1,false,2,5);
                     if(_loc4_ > 10)
                     {
                        if(this.screaming == 0)
                        {
                           this.playSound("chicksound",3);
                           this.screaming = 10;
                        }
                        if(this.grounding == 0)
                        {
                           this.playSound("punchsound",3);
                           this.grounding = 10;
                        }
                     }
                     if(_loc4_ > 30)
                     {
                        this.paralyzed += 10;
                     }
                     this.atan = Math.atan2(-this.player.vy,this.player.vx);
                     this.player.vx -= this.player.vx * Math.cos(this.atan) * 0.24;
                     this.player.vy = -this.player.vy * 0.325;
                     this.player.y = 299 + this.xtra;
                     this.player.inAir = true;
                     this.stillTime = 0;
                  }
                  else
                  {
                     ++this.stillTime;
                     this.player.vy = 0;
                     this.player.vx = 0;
                     this.player.y = 300 + this.xtra;
                     this.player.inAir = false;
                     this.player.rotation = 0;
                  }
               }
               else
               {
                  this.player.inAir = true;
                  this.stillTime = 0;
               }
            }
            this.heighta = -_HUD.top * 10 - this.container.y + this.player.vy;
            if(this.heighta > -200)
            {
               this.goPlayer = true;
               this.container.y = -_HUD.top * 10 + 201;
            }
            else if(this.player.y <= 200)
            {
               this.goPlayer = false;
               this.player.y = 200;
            }
            if(this.heighta < -159200)
            {
               if(this.screaming == 0)
               {
                  this.playSound("chicksound",3);
                  this.screaming = 10;
               }
               if(this.grounding == 0)
               {
                  this.playSound("punchsound",3);
                  this.grounding = 10;
               }
               _loc4_ = Math.sqrt(this.player.vx * this.player.vx + this.player.vy * this.player.vy);
               this.createFX(this.player,_loc4_ * 0.2,false,1);
               this.createFX(this.player,_loc4_ * 0.1,false,2,5);
               if(_loc4_ > 30)
               {
                  this.paralyzed += 30;
               }
               this.atan = Math.atan2(-this.player.vy,this.player.vx);
               this.player.vx -= this.player.vx * Math.cos(this.atan) * 0.24;
               this.player.vy = -this.player.vy * 0.425;
               this.player.inAir = true;
            }
            _loc2_ = this.player.x;
            this.container.x -= this.player.vx;
            this.bg.x -= this.player.vx * 0.2;
            this.cloudc.x -= this.player.vx * 0.55;
            if(this.bg.x <= -1600)
            {
               this.bg.x = 0;
            }
            this.fx.y = this.player.y;
            if(!this.goPlayer)
            {
               this.container.y -= this.player.vy;
               this.bg.y = this.container.y / 35;
               this.cloudc.y -= this.player.vy;
               this.scroller.Scroll(this.fxbm,-this.player.vx,-this.player.vy);
               this.scroller.Scroll(this.fxbm2,-this.player.vx,-this.player.vy);
               this.scroller.Scroll(this.fxbm3,-this.player.vx,-this.player.vy);
               this.impact = true;
            }
            else
            {
               this.player.y += this.player.vy;
               if(this.impact)
               {
                  this.scroller.cc = true;
                  this.impact = false;
               }
               this.scroller.Scroll(this.fxbm,-this.player.vx,0);
               this.scroller.Scroll(this.fxbm2,-this.player.vx,0);
               this.scroller.Scroll(this.fxbm3,-this.player.vx,0);
               this.scroller.cc = false;
            }
            if(this.ground.x + this.container.x < -1440)
            {
               this.ground.x = -this.container.x;
            }
            if(this.container.y > 88000)
            {
               this.ground.y = -157410;
               this.ground.scaleY = -1;
            }
            else
            {
               this.ground.y = this.top;
               this.ground.scaleY = 1;
            }
            if(this.bgupdate == 0)
            {
               _loc5_ = 0;
               while(_loc5_ < 13)
               {
                  _loc6_ = this.bgparts1[_loc5_];
                  _loc8_ = this.bgparts2[_loc5_];
                  _loc7_ = _loc6_.y + this.bg.y + this.bg.a.y;
                  if(_loc7_ + 440 > -10 && _loc7_ < this.rsh)
                  {
                     _loc6_.visible = true;
                     _loc8_.visible = true;
                  }
                  else
                  {
                     _loc6_.visible = false;
                     _loc8_.visible = false;
                  }
                  _loc5_++;
               }
               this.bgupdate = 5;
            }
            --this.bgupdate;
            this.updateFX();
            if(this.player.inAir)
            {
               this.abs = -this.atan * this.toDeg - this.player.rotation;
               if((this.abs ^ this.abs >> 31) - (this.abs >> 31) > 180)
               {
                  this.player.rotation = -this.atan * this.toDeg;
               }
               if(-this.atan * this.toDeg > 80)
               {
                  this.player.rotation = 80;
               }
               else
               {
                  this.player.rotation -= (this.player.rotation - -this.atan * this.toDeg) * 0.3;
               }
               this.powern = this.player.power + 1;
               this.player.vx -= this.player.vx * 0.00394;
               this.player.vx += Math.cos(_loc1_) * this.player.power * 0.587;
               if(this.player.vx > 150)
               {
                  this.player.vx = 150;
               }
               this.player.vy += Math.sin(_loc1_) * this.player.power * this.player.force;
               if(this.player.vx < 0.3 && Math.abs(this.player.vy) < 0.5)
               {
                  this.player.vx = 0;
                  this.player.vy = 0;
               }
               if(this.player.vy > 0)
               {
                  this.dir = 1;
               }
               else
               {
                  this.dir = -1;
               }
            }
            this.regulateSpeed(this.player,80);
            this.abs = this.player.vy * 3.5;
            this.rot = Math.atan2((this.abs ^ this.abs >> 31) - (this.abs >> 31),this.player.vx * 3) * this.toDeg;
            this.pRot = this.rot;
            this.leg = this.player.bird.l1.leg;
            if(this.pRot < 50)
            {
               this.pRot = 50;
            }
            this.leg.rotation -= (this.leg.rotation - this.pRot) * 0.1;
            this.leg = this.player.bird.l2.leg;
            this.leg.rotation -= (this.leg.rotation - this.pRot) * 0.3;
            this.arm = this.player.bird.a1.arm.arm;
            this.pRot = this.rot - 80;
            this.ar1 -= (this.arm.rotation - this.pRot) * 0.3;
            this.arm.rotation -= (this.arm.rotation - this.pRot) * 0.3;
            this.arm = this.player.bird.a2.arm.arm;
            this.arm.rotation -= (this.arm.rotation - this.pRot) * 0.15;
            this.head = this.player.bird.head.head;
            if(this.fx.alpha > 0.1 || this.paralyzed != 0)
            {
               this.head.gotoAndStop("lock");
               this.headLocked = true;
            }
            else if(this.headLocked)
            {
               this.head.gotoAndPlay(1);
               this.headLocked = false;
            }
            this.head.rotation -= (this.head.rotation - this.rot) * 0.15;
            this.distance += this.player.vx * 0.0035;
            this.alti -= this.player.vy * 0.1;
            if(this.alti > this.heighestPoint)
            {
               this.heighestPoint = this.alti;
            }
         }
         if(this.playerInterval == 0)
         {
            this.playerInterval = 2;
         }
         else
         {
            --this.playerInterval;
         }
      }
      
      private function regulateSpeed(param1:Bird, param2:int) : *
      {
         if(param1.vy > param2)
         {
            param1.vy = param2;
         }
         else if(param1.vy < -param2)
         {
            param1.vy = -param2;
         }
      }
      
      internal function __setProp___id1__Scene1_Layer7_0() : *
      {
         if(this.__setPropDict[this.__id1_] == undefined || int(this.__setPropDict[this.__id1_]) != 1)
         {
            this.__setPropDict[this.__id1_] = 1;
            try
            {
               this.__id1_["componentInspectorSetting"] = true;
            }
            catch(e:Error)
            {
            }
            this.__id1_.movieId = "20931:6CZcq1Ht";
            this.__id1_.debugMode = false;
            this.__id1_.encryptionKey = "iBvs0cVzsG5aYgkJHrZKkhdbay3cuLPb";
            this.__id1_.movieVersion = "";
            this.__id1_.showConnectingPopup = false;
            this.__id1_.useErrorPopup = true;
            this.__id1_.useMedalPopup = true;
            this.__id1_.useFakeSession = true;
            try
            {
               this.__id1_["componentInspectorSetting"] = false;
            }
            catch(e:Error)
            {
            }
         }
      }
      
      internal function frame1() : *
      {
         this.__setProp___id1__Scene1_Layer7_0();
         this.playgame.visible = false;
         this.added = false;
         addEventListener(Event.ENTER_FRAME,this.showProgress);
         stop();
         stop();
      }
      
      internal function frame2() : *
      {
         GUI(this.UIload).UI = this.UIload;
         GUI(this.UIload)._stage = stage;
         GUI(this.UIload).update = 1;
         GUI(this.UIload).init();
         stop();
      }
      
      internal function frame3() : *
      {
         GUI(this.UI).UI = this.UI;
         GUI(this.UI)._stage = stage;
         GUI(this.UI).update = 1;
         GUI(this.UI).init();
      }
      
      internal function frame5() : *
      {
         GUI(this.UIa).UI = this.UIa;
         GUI(this.UIa)._stage = stage;
         GUI(this.UIa).update = 1;
         GUI(this.UIa).init();
         Store(this.store).Update();
      }
      
      internal function frame6() : *
      {
         this.ybird.Update();
         GUI(this.UI).UI = this.UI;
         GUI(this.UI)._stage = stage;
         GUI(this.UI).update = 1;
         GUI(this.UI).init();
      }
      
      internal function frame7() : *
      {
      }
   }
}

