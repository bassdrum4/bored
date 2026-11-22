package
{
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.display.Stage;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.utils.getDefinitionByName;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol817")]
   public class Scroller extends MovieClip
   {
      
      public var al:MovieClip;
      
      public var _objects:MovieClip;
      
      public var on:Boolean = false;
      
      private var vx:Number = 0;
      
      public var down:int = 0;
      
      public var current:Number;
      
      public var _stage:Stage;
      
      public var added:int = 0;
      
      public var speed:Number = 0.62;
      
      public var friction:Number = 0.18;
      
      public var Child:int;
      
      public var Parent:String;
      
      public var center:int = 0;
      
      public var wid:int = 100;
      
      public var hei:int = 100;
      
      private var closest:Number;
      
      public var childer:int = 0;
      
      public var through:Boolean = false;
      
      public var Pars:Array = [];
      
      public var _update:int = 0;
      
      private var first:int = 0;
      
      public var home:String;
      
      private var _root:MovieClip;
      
      public var disabled:int = 0;
      
      private var startMX:Number;
      
      private var scrolling:Boolean = false;
      
      private var over:*;
      
      public var arr:Vector.<String>;
      
      public var change:Boolean = true;
      
      public var scroller:MovieClip;
      
      private var now:int;
      
      private var timer:int = 0;
      
      public var own:Vector.<String>;
      
      public var circles:Vector.<MovieClip> = new Vector.<MovieClip>();
      
      public var dir:int = 0;
      
      public var fastScroll:Boolean = false;
      
      public var position:Number = 0;
      
      public var cCon:Sprite;
      
      public var currenta:int = 0;
      
      public var nex:*;
      
      public var prev:*;
      
      public function Scroller()
      {
         super();
         addEventListener(Event.ENTER_FRAME,this.update);
      }
      
      private function downed(param1:MouseEvent) : void
      {
         if(globalVars.mobile)
         {
            this.down = 1;
            if(this.dir == 0)
            {
               this.current = mouseX;
               this.startMX = mouseX;
            }
            else
            {
               this.current = mouseY;
               this.startMX = mouseY;
            }
         }
      }
      
      private function upped(param1:MouseEvent) : void
      {
         this.down = 0;
      }
      
      private function update(param1:Event) : void
      {
         var _loc2_:int = 0;
         var _loc3_:int = 0;
         var _loc4_:Class = null;
         var _loc5_:* = undefined;
         var _loc6_:Number = NaN;
         var _loc7_:int = 0;
         var _loc8_:Boolean = false;
         var _loc9_:int = 0;
         var _loc10_:int = 0;
         var _loc11_:MovieClip = null;
         var _loc12_:int = 0;
         var _loc13_:int = 0;
         var _loc14_:int = 0;
         var _loc15_:int = 0;
         var _loc16_:Vector.<int> = null;
         var _loc17_:int = 0;
         if(!this.on || this._objects == null || this.arr == null)
         {
            return;
         }
         if(this._update == 1)
         {
            this._root = MovieClip(root);
            this.vx = 0;
            this.down = 0;
            if(this.change)
            {
               this.current = NaN;
               this.closest = 0;
               this.currenta = 0;
               this.position = 0;
               this.change = false;
            }
            this._update = 0;
            removeEventListener(MouseEvent.MOUSE_DOWN,this.downed);
            this._stage.removeEventListener(MouseEvent.MOUSE_UP,this.upped);
            removeEventListener(MouseEvent.MOUSE_OVER,this.overed);
            while(this.Pars.length > 0)
            {
               _loc2_ = this.Pars.length - 1;
               if(this.Pars[_loc2_] != null)
               {
                  this._objects.removeChild(this.Pars[_loc2_]);
               }
               this.Pars.pop();
            }
            if(!globalVars.mobile)
            {
               while(this.circles.length > 0)
               {
                  this.cCon.removeChild(this.circles[this.circles.length - 1]);
                  this.circles.pop();
               }
            }
            this.al.width = 1;
            this.al.height = 1;
            this.home = this._root.currentLabel;
            this.added = 0;
            this.first = 0;
         }
         if(this.home != this._root.currentLabel)
         {
            return;
         }
         if(this.added == 0)
         {
            if(this.dir == 0)
            {
               this._objects.x = 0;
            }
            else
            {
               this._objects.y = 0;
            }
            this.added = 1;
            addEventListener(MouseEvent.MOUSE_DOWN,this.downed);
            this._stage.addEventListener(MouseEvent.MOUSE_UP,this.upped);
            this._stage.addEventListener(MouseEvent.MOUSE_OVER,this.overed);
            _loc3_ = 0;
            _loc4_ = getDefinitionByName(this.Parent) as Class;
            if(this.through)
            {
               _loc6_ = 45;
            }
            else
            {
               _loc6_ = 10;
            }
            _loc7_ = globalVars.cash;
            _loc8_ = true;
            _loc9_ = int(this.arr.length);
            if(this.through)
            {
               switch(this.childer)
               {
                  case 1:
                     _loc13_ = int(globalVars.helmets.length);
                     break;
                  case 2:
                     _loc13_ = int(globalVars.belts.length);
                     break;
                  case 3:
                     _loc13_ = int(globalVars.rockets.length);
               }
               if(!globalVars.mobile)
               {
                  _loc10_ = Math.ceil((this.Child - _loc13_) * 0.5);
                  if(_loc10_ > 0)
                  {
                     while(_loc3_ < _loc10_)
                     {
                        _loc11_ = new sCircle();
                        this.cCon.addChild(_loc11_);
                        _loc11_.x = _loc3_ * (_loc11_.width + 5);
                        this.circles.push(_loc11_);
                        _loc3_++;
                     }
                     this.circles[0].nextFrame();
                     this.cCon.x = 400 - this.cCon.width * 0.5;
                  }
               }
            }
            else if(!globalVars.mobile)
            {
               _loc10_ = Math.ceil(this.arr.length * 0.5);
               while(_loc3_ < _loc10_)
               {
                  _loc11_ = new sCircle();
                  this.cCon.addChild(_loc11_);
                  _loc11_.scaleX = 0.6;
                  _loc11_.scaleY = 0.6;
                  _loc11_.y = _loc3_ * (_loc11_.width + 5);
                  this.circles.push(_loc11_);
                  _loc3_++;
               }
               this.circles[0].nextFrame();
               this.cCon.y = 175 - this.cCon.height * 0.5;
            }
            _loc3_ = 0;
            _loc12_ = 0;
            while(_loc9_ > _loc3_)
            {
               if(this.through)
               {
                  _loc8_ = true;
                  if(this.own.indexOf(this.arr[_loc3_]) != -1)
                  {
                     _loc8_ = false;
                  }
               }
               if(_loc8_)
               {
                  _loc5_ = new _loc4_();
                  _loc12_++;
                  this._objects.addChild(_loc5_);
                  if(this.childer == 1)
                  {
                     _loc5_.gotoAndStop("helmets");
                     _loc5_.helm.gotoAndStop(this.arr[_loc3_]);
                     if(_loc5_.ca != null)
                     {
                        _loc5_.ca.text = "$" + _loc5_.helm.num;
                     }
                     else
                     {
                        _loc5_.para.gotoAndStop(2);
                        _loc5_.para.p1.text = "CONFIDENCE: " + _loc5_.helm.mood;
                        _loc5_.para.p2.text = "PROTECTION: " + _loc5_.helm.prot;
                     }
                  }
                  else if(this.childer == 2)
                  {
                     _loc5_.gotoAndStop("belts");
                     _loc5_.belt.gotoAndStop(this.arr[_loc3_]);
                     if(_loc5_.ca != null)
                     {
                        _loc5_.ca.text = "$" + _loc5_.belt.num;
                     }
                     else
                     {
                        _loc5_.para.gotoAndStop(2);
                        _loc5_.para.p1.text = "WEIGHT: " + _loc5_.belt.weight;
                        _loc5_.para.p2.text = "PROTECTION: " + _loc5_.belt.prot;
                     }
                  }
                  else if(this.childer == 3)
                  {
                     _loc5_.gotoAndStop("rockets");
                     _loc5_.rak.gotoAndStop(this.arr[_loc3_]);
                     if(_loc5_.ca != null)
                     {
                        _loc5_.ca.text = "$" + _loc5_.rak.num;
                     }
                     else
                     {
                        _loc5_.para.gotoAndStop(1);
                        _loc5_.para.p1.text = "FUEL: " + _loc5_.rak.fuel;
                        _loc5_.para.p2.text = "WEIGHT: " + _loc5_.rak.weight;
                        _loc5_.para.p3.text = "POWER: " + _loc5_.rak.intensitet;
                     }
                  }
                  else
                  {
                     _loc5_.gotoAndStop(this.arr[_loc3_]);
                  }
                  if(this.arr[_loc3_] == "none")
                  {
                     _loc5_.nonetext.visible = true;
                  }
                  if(this.dir == 0)
                  {
                     _loc5_.x = _loc6_;
                     _loc6_ += 391;
                     _loc5_.y = this.center;
                  }
                  else
                  {
                     _loc5_.y = _loc6_;
                     _loc6_ += _loc5_.height + 20;
                     _loc5_.x = this.center;
                  }
                  this.Pars.push(_loc5_);
                  if(this.Parent == "Item")
                  {
                     if(globalVars.news.indexOf(this.arr[_loc3_]) == -1)
                     {
                        globalVars.news.push(this.arr[_loc3_]);
                        _loc5_.newicon.visible = true;
                     }
                     if(_loc5_.currentLabel == "helmets")
                     {
                        _loc14_ = int(_loc5_.helm.num);
                        _loc5_.para.gotoAndStop(2);
                        _loc5_.para.p1.text = "CONFIDENCE: " + _loc5_.helm.mood;
                        _loc5_.para.p2.text = "PROTECTION: " + _loc5_.helm.prot;
                     }
                     else if(_loc5_.currentLabel == "belts")
                     {
                        _loc14_ = int(_loc5_.belt.num);
                        _loc5_.para.gotoAndStop(2);
                        _loc5_.para.p1.text = "WEIGHT: " + _loc5_.belt.weight;
                        _loc5_.para.p2.text = "PROTECTION: " + _loc5_.belt.prot;
                     }
                     else if(_loc5_.currentLabel == "rockets")
                     {
                        _loc14_ = int(_loc5_.rak.num);
                        _loc5_.para.gotoAndStop(1);
                        _loc5_.para.p1.text = "FUEL: " + _loc5_.rak.fuel;
                        _loc5_.para.p2.text = "WEIGHT: " + _loc5_.rak.weight;
                        _loc5_.para.p3.text = "POWER: " + _loc5_.rak.intensitet;
                     }
                     else
                     {
                        _loc14_ = int(_loc5_.num);
                     }
                     if(_loc7_ >= _loc14_)
                     {
                        _loc5_.purch.gotoAndStop(1);
                     }
                     else
                     {
                        _loc5_.purch.gotoAndStop(2);
                     }
                  }
               }
               _loc3_++;
            }
            if(this.through)
            {
               trace("BOM");
               _loc15_ = 0;
               trace(globalVars.ftR);
               switch(this.childer)
               {
                  case 1:
                     _loc16_ = Vector.<int>(globalVars.ftH);
                     break;
                  case 2:
                     _loc16_ = Vector.<int>(globalVars.ftB);
                     break;
                  case 3:
                     _loc16_ = Vector.<int>(globalVars.ftR);
               }
               _loc3_ = _loc12_;
               _loc17_ = 0;
               while(_loc3_ < this.Child)
               {
                  _loc5_ = new sLocked();
                  trace(this.Child + " - " + _loc15_);
                  while(_loc16_[_loc15_] == 0)
                  {
                     if(_loc15_ == _loc16_.length)
                     {
                        _loc17_ = 1;
                        break;
                     }
                     _loc15_++;
                  }
                  if(_loc17_ == 1)
                  {
                     break;
                  }
                  _loc5_.txt.text = "Unlocks at " + _loc16_[_loc15_] + "ft.";
                  this._objects.addChild(_loc5_);
                  _loc5_.x = _loc6_;
                  this.Pars.push(_loc5_);
                  _loc6_ += 391;
                  _loc15_++;
                  _loc3_++;
               }
            }
            this.al.width = width;
            this.al.height = height;
         }
         if(this.circles.length == this.currenta + 1 || globalVars.mobile)
         {
            this.nex.visible = false;
         }
         else
         {
            this.nex.visible = true;
         }
         if(this.currenta == 0 || globalVars.mobile)
         {
            this.prev.visible = false;
         }
         else
         {
            this.prev.visible = true;
         }
         if(globalVars.mobile)
         {
            if(this.Pars.length != 0)
            {
               if(this.dir == 0)
               {
                  this._objects.x += this.vx;
               }
               else
               {
                  this._objects.y += this.vx;
               }
               this.vx -= this.vx * this.friction;
               if(this.down == 1)
               {
                  if(this.dir == 0)
                  {
                     this.vx -= -(mouseX - this.current) * this.speed;
                     this.current = mouseX;
                     if(this.disabled == 0)
                     {
                        if(Math.abs(this.startMX - mouseX) > 6)
                        {
                           this.disabled = 10;
                        }
                     }
                  }
                  else
                  {
                     this.vx -= -(mouseY - this.current) * this.speed;
                     this.current = mouseY;
                     if(this.disabled == 0)
                     {
                        if(Math.abs(this.startMX - mouseY) > 6)
                        {
                           this.disabled = 10;
                        }
                     }
                  }
               }
               else
               {
                  if(this.disabled > 0)
                  {
                     --this.disabled;
                  }
                  if(this.first == 0)
                  {
                     if(this.dir == 0)
                     {
                        this._objects.x = this.closest;
                     }
                     else
                     {
                        this._objects.y = this.closest;
                     }
                     this.first = 1;
                  }
                  if(this.timer == 0)
                  {
                     this.closest = this.findClosest(0);
                     this.timer = 4;
                  }
                  --this.timer;
                  if(this.dir == 0)
                  {
                     this.vx -= (this._objects.x - this.closest) * 0.02;
                  }
                  else
                  {
                     this.vx -= (this._objects.y - this.closest) * 0.02;
                  }
               }
            }
         }
         else if(this.dir == 0)
         {
            this._objects.x -= (this._objects.x - this.position) * 0.3;
         }
         else
         {
            this._objects.y -= (this._objects.y - this.position) * 0.3;
         }
      }
      
      private function overed(param1:MouseEvent) : void
      {
         if(param1.target.name == "field")
         {
            if(param1.target.parent.currentLabel != "locked")
            {
               if(this.over != null)
               {
                  this.over.para.visible = false;
                  this.over = null;
               }
               this.over = param1.target.parent;
               this.over.para.visible = true;
            }
            else if(this.over != null)
            {
               this.over.para.visible = false;
               this.over = null;
            }
         }
         else if(this.over != null)
         {
            this.over.para.visible = false;
            this.over = null;
         }
      }
      
      private function findClosest(param1:Number) : Number
      {
         var _loc2_:* = undefined;
         var _loc4_:* = undefined;
         var _loc5_:Number = NaN;
         var _loc3_:Number = -1;
         var _loc6_:int = 0;
         while(_loc6_ < this.Pars.length)
         {
            if(Math.abs(this.now - _loc6_) < 5)
            {
               _loc2_ = this.Pars[_loc6_];
               if(_loc2_ != undefined)
               {
                  if(this.dir == 0)
                  {
                     _loc5_ = Math.abs(_loc2_.x + this._objects.x + this.vx);
                  }
                  else
                  {
                     _loc5_ = Math.abs(_loc2_.y + this._objects.y + this.vx);
                  }
                  if(_loc5_ < _loc3_ || _loc3_ == -1)
                  {
                     _loc3_ = _loc5_;
                     _loc4_ = _loc2_;
                     this.now = _loc6_;
                  }
               }
            }
            _loc6_++;
         }
         if(this.dir == 0)
         {
            return -_loc4_.x;
         }
         return -_loc4_.y;
      }
   }
}

