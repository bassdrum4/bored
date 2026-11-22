package
{
   import flash.display.MovieClip;
   import flash.display.Stage;
   import flash.events.Event;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol948")]
   public class GUI extends MovieClip
   {
      
      public var udsbtn:MovieClip;
      
      public var storebtn:MovieClip;
      
      public var birdbtn:MovieClip;
      
      public var beltbtn:MovieClip;
      
      public var helmbtn:MovieClip;
      
      public var menubtn:MovieClip;
      
      public var backtoa:MovieClip;
      
      public var backto:MovieClip;
      
      public var sa1:MovieClip;
      
      public var playbtn:MovieClip;
      
      public var sa2:MovieClip;
      
      public var ops:MovieClip;
      
      public var sa3:MovieClip;
      
      public var instructionsbtn:MovieClip;
      
      private var home:String;
      
      private var _root:MovieClip;
      
      public var buttons:Array;
      
      public var UI:MovieClip;
      
      public var _stage:Stage;
      
      public var update:int = 0;
      
      public var GUIBS:Vector.<GUIB> = new Vector.<GUIB>();
      
      public var bL:int;
      
      public var _type:String = "menu";
      
      public var multi:Number = 1.3;
      
      public var able:int = 1;
      
      public function GUI()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2,2,this.frame3,3,this.frame4);
         this._root = MovieClip(root);
      }
      
      public function init() : void
      {
         this._type = this._root.currentLabel;
         gotoAndStop(this._type);
         addEventListener(Event.ENTER_FRAME,this.Update);
      }
      
      private function Update(param1:Event) : void
      {
         var _loc2_:int = 0;
         var _loc3_:MovieClip = null;
         var _loc4_:Number = NaN;
         var _loc5_:GUIB = null;
         var _loc6_:GUIB = null;
         var _loc7_:GUIB = null;
         var _loc8_:MovieClip = null;
         if(!main.mobile)
         {
            if(this._root.currentLabel != this._type)
            {
               while(0 < this.GUIBS.length)
               {
                  this.GUIBS.pop();
                  this.buttons.pop();
               }
               removeEventListener(Event.ENTER_FRAME,this.Update);
            }
            if(this.buttons.length == 0)
            {
               return;
            }
            if(this.bL == 0 && this.update == 1)
            {
               this.bL = this.buttons.length;
            }
            if(this.update == 1)
            {
               _loc2_ = 0;
               this.home = globalVars.home.currentLabel;
               while(_loc2_ < this.bL)
               {
                  _loc8_ = this.buttons[_loc2_];
                  _loc7_ = new GUIB(_loc8_);
                  _loc7_.num = _loc2_;
                  _loc8_.buttonMode = true;
                  this.GUIBS.push(_loc7_);
                  _loc2_++;
               }
               this.update = 0;
            }
            if(this.home != globalVars.home.currentLabel)
            {
               return;
            }
            if(this.able == 0)
            {
               return;
            }
            _loc2_ = 0;
            _loc4_ = 0;
            _loc6_ = null;
            while(_loc2_ < this.bL)
            {
               _loc7_ = this.GUIBS[_loc2_];
               _loc7_.starg = 1 * _loc7_.os;
               if(_loc7_.button.hitTestPoint(this._stage.mouseX,this._stage.mouseY))
               {
                  _loc7_.starg = this.multi * _loc7_.os;
                  _loc7_.xtarg = _loc7_.ox;
                  _loc6_ = _loc7_;
               }
               _loc7_.button.scaleX += _loc7_.sx;
               _loc7_.button.scaleY = _loc7_.button.scaleX;
               _loc7_.sx -= (_loc7_.button.scaleX - _loc7_.starg) * 0.15;
               _loc7_.sx -= _loc7_.sx * 0.35;
               if(_loc7_.button.scaleX > _loc4_)
               {
                  _loc4_ = _loc7_.button.scaleX;
                  _loc3_ = _loc7_.button;
               }
               _loc2_++;
            }
            if(_loc3_ != null)
            {
               if(_loc3_.scaleX > 1 * _loc3_.os)
               {
                  this.UI.setChildIndex(_loc3_,this.UI.numChildren - 1);
               }
            }
         }
      }
      
      internal function frame1() : *
      {
         GUI(this).buttons = [this.playbtn,this.instructionsbtn,this.birdbtn,this.ops];
      }
      
      internal function frame2() : *
      {
         GUI(this).buttons = [this.menubtn,this.backto,this.storebtn];
      }
      
      internal function frame3() : *
      {
         GUI(this).buttons = [this.backtoa,this.birdbtn,this.helmbtn,this.udsbtn,this.beltbtn,this.menubtn];
      }
      
      internal function frame4() : *
      {
         GUI(this).buttons = [this.sa1,this.sa2,this.sa3];
      }
   }
}

