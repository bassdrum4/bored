package
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol1029")]
   public class Bird extends MovieClip
   {
      
      public var bird:MovieClip;
      
      public var vx:Number = 0;
      
      public var vy:Number = 0;
      
      public var velocityX:Number = 0;
      
      public var velocityY:Number = 0;
      
      public var down:Boolean = false;
      
      public var up:Boolean = false;
      
      public var stalling:Boolean = false;
      
      public var speedx:Number = 0;
      
      public var speedy:Number = 0;
      
      public var inAir:Boolean = true;
      
      public var rot:Number = 0;
      
      public var looping:Boolean = false;
      
      public var force:Number = 1.5;
      
      public var power:Number = 0;
      
      public var rota:Number = 0;
      
      public function Bird()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2);
      }
      
      internal function frame1() : *
      {
         stop();
      }
      
      internal function frame2() : *
      {
         this.bird.gotoAndPlay(1);
      }
   }
}

