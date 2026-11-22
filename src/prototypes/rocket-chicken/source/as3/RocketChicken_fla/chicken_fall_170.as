package RocketChicken_fla
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol1019")]
   public dynamic class chicken_fall_170 extends MovieClip
   {
      
      public var rak:MovieClip;
      
      public var a1:MovieClip;
      
      public var a2:MovieClip;
      
      public var head:MovieClip;
      
      public var l1:MovieClip;
      
      public var l2:MovieClip;
      
      public var belt:MovieClip;
      
      public function chicken_fall_170()
      {
         super();
         addFrameScript(3,this.frame4);
      }
      
      internal function frame4() : *
      {
         gotoAndPlay(1);
      }
   }
}

