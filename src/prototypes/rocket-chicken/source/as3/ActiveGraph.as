package
{
   import flash.display.Shape;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.events.TimerEvent;
   import flash.system.System;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFormat;
   import flash.utils.Timer;
   
   public class ActiveGraph extends Sprite
   {
      
      private const WIDTH:Number = 50;
      
      private const HEIGHT:Number = 15;
      
      private const PAGE:Number = 4096;
      
      private var verboseMode:Boolean;
      
      private var returnVal:Boolean;
      
      private var lastPlot1:int;
      
      private var lastPlot2:int;
      
      private var plot:int;
      
      private var plotLength:int;
      
      private var high:Number;
      
      private var low:Number;
      
      private var itr:Number;
      
      private var history:Array;
      
      private var output:String;
      
      private var sign:String;
      
      private var timer:Timer;
      
      private var textBox:TextField;
      
      private var textFormat:TextFormat;
      
      private var graphBackground:Sprite;
      
      private var plotLine:Shape;
      
      private var backX:Number;
      
      private var backY:Number;
      
      private var numerator:Number;
      
      private var denominator:Number;
      
      private var average:int;
      
      private var old:int;
      
      private var caught2:Boolean = false;
      
      private var fn:Function;
      
      public function ActiveGraph(param1:Number = 0, param2:Boolean = false, param3:Boolean = true, param4:int = 2)
      {
         super();
         param4 = Math.min(param4,2);
         this.lastPlot1 = this.lastPlot2 = this.plot = this.plotLength = 0;
         this.history = new Array();
         this.numerator = this.denominator = this.average = 0;
         this.timer = new Timer(param1);
         this.verboseMode = param2;
         switch(param4)
         {
            case 0:
               this.fn = this.test0;
               break;
            case 2:
               this.fn = this.test2;
               break;
            default:
               this.fn = this.test1;
         }
         if(param3)
         {
            this.textBox = new TextField();
            this.textFormat = new TextFormat();
            this.graphBackground = new Sprite();
            this.plotLine = new Shape();
            this.textFormat.size = 9;
            this.textFormat.font = "Monaco";
            this.textFormat.color = 16777215;
            this.textBox.selectable = false;
            this.textBox.autoSize = TextFieldAutoSize.LEFT;
            this.textBox.x = this.WIDTH + 5;
            this.textBox.height = this.HEIGHT;
            this.graphBackground.graphics.beginFill(0);
            this.graphBackground.graphics.drawRect(0,0,this.WIDTH + 85,this.HEIGHT);
            this.graphBackground.graphics.endFill();
            this.graphBackground.graphics.lineStyle(0.5,16777215);
            this.graphBackground.graphics.drawRect(0,0,this.WIDTH,this.HEIGHT - 1);
            this.addChild(this.graphBackground);
            this.addChild(this.plotLine);
            this.addChild(this.textBox);
            this.timer.addEventListener(TimerEvent.TIMER,this.drawMem,false,0,true);
            this.textBox.mouseEnabled = false;
            this.backX = x;
            this.backY = y;
            this.graphBackground.addEventListener(MouseEvent.MOUSE_DOWN,this.handleDrag,false,0,true);
            this.graphBackground.addEventListener(MouseEvent.MOUSE_UP,this.handleDrag,false,0,true);
            this.addEventListener(Event.ADDED_TO_STAGE,this.loadDrag,false,0,true);
         }
         else
         {
            trace("ActiveGraph Running.");
            this.timer.addEventListener(TimerEvent.TIMER,this.trackMem,false,0,true);
         }
         this.timer.start();
      }
      
      private function trackMem(param1:TimerEvent = null) : Boolean
      {
         this.returnVal = false;
         this.plot = System.totalMemory / this.PAGE;
         this.old = this.average;
         this.numerator += this.plot;
         ++this.denominator;
         this.average = this.numerator / this.denominator;
         if(Boolean(this.fn()) && this.verboseMode)
         {
            trace(this.plot);
         }
         return this.returnVal;
      }
      
      private function test0() : Boolean
      {
         if(this.lastPlot1 != this.plot)
         {
            this.returnVal = true;
            this.lastPlot1 = this.plot;
         }
         return this.returnVal;
      }
      
      private function test1() : Boolean
      {
         this.returnVal = !this.lastPlot1 || this.lastPlot1 > this.plot;
         this.lastPlot1 = this.plot;
         return this.returnVal;
      }
      
      private function test2() : Boolean
      {
         if(this.lastPlot1 > this.plot || !this.lastPlot1)
         {
            if(this.lastPlot2 > this.plot || !this.lastPlot2)
            {
               this.caught2 = true;
            }
            this.lastPlot2 = this.plot;
         }
         else if(this.lastPlot1 < this.plot && this.caught2)
         {
            this.plot = this.lastPlot2;
            this.returnVal = true;
            this.caught2 = false;
         }
         this.lastPlot1 = this.plot;
         return this.returnVal;
      }
      
      private function drawMem(param1:TimerEvent = null) : void
      {
         if(this.trackMem())
         {
            this.plotLine.graphics.clear();
            if(this.plotLength == 21)
            {
               this.history.shift();
               --this.plotLength;
            }
            if(this.plot > this.history[int(this.plotLength - 1)])
            {
               this.sign = "+ , ";
            }
            else if(this.plot < this.history[int(this.plotLength - 1)])
            {
               this.sign = "- , ";
            }
            else
            {
               this.sign = "  , ";
            }
            this.history.push(this.plot);
            this.plotLength = this.history.length;
            if(this.plotLength > 1)
            {
               this.plotLine.graphics.lineStyle(2.5,16711680);
               this.high = 0;
               this.low = Infinity;
               this.itr = 0;
               while(this.itr < this.plotLength)
               {
                  this.high = Math.max(this.history[this.itr],this.high);
                  this.low = Math.min(this.history[this.itr],this.low);
                  ++this.itr;
               }
               this.plotLine.graphics.moveTo(0,this.HEIGHT * (1 - (this.history[0] - this.low) / (this.high - this.low)));
               this.itr = 1;
               while(this.itr < this.plotLength)
               {
                  this.plotLine.graphics.lineTo(this.WIDTH * this.itr / (this.plotLength - 1),this.HEIGHT * (1 - (this.history[this.itr] - this.low) / (this.high - this.low)));
                  ++this.itr;
               }
            }
            this.output = this.plot + this.sign;
            this.textBox.text = String(this.output) + String(this.average);
            this.textBox.setTextFormat(this.textFormat);
         }
      }
      
      private function handleDrag(param1:Event) : void
      {
         switch(param1.type)
         {
            case MouseEvent.MOUSE_DOWN:
               this.backX = x;
               this.backY = y;
               startDrag();
               break;
            case MouseEvent.MOUSE_UP:
               stopDrag();
               break;
            case Event.MOUSE_LEAVE:
               stopDrag();
               x = this.backX;
               y = this.backY;
         }
      }
      
      private function loadDrag(param1:Event) : void
      {
         this.stage.addEventListener(Event.MOUSE_LEAVE,this.handleDrag,false,0,true);
      }
      
      public function get data() : Number
      {
         return this.plot;
      }
   }
}

