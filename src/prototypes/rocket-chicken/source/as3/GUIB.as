package
{
   import flash.display.MovieClip;
   
   public class GUIB
   {
      
      public var button:MovieClip;
      
      public var vx:Number = 0;
      
      public var depth:int = 0;
      
      public var sx:Number = 0;
      
      public var ox:Number;
      
      public var starg:Number = 1;
      
      public var xtarg:Number;
      
      public var num:int;
      
      public var os:Number;
      
      public function GUIB(param1:MovieClip)
      {
         super();
         this.button = param1;
         this.ox = this.button.y;
         this.xtarg = this.ox;
         this.os = this.button.scaleX;
      }
   }
}

